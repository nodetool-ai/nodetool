# Realtime graphics and audio in the native graph runner

Status: draft, revision 3. Nothing in this document is implemented. Sections 4
to 17 specify proposed behavior. Revisions 2 and 3 answer two design reviews.
Sections 3.5 and 3.6 list their findings and the section that resolves each one.

Cross-plan references use `RT-`, for example `RT-D4`. Local IDs stay unchanged.

Citations of this repository are relative to its root at `15c446f645`.
Citations of TiXL refer to [tixl3d/tixl][tixl] at `5bc0c54`. The findings come
from source inspection and from one micro-benchmark (section 3.4). No frame
pacing, GPU or audio device measurement was made. Phase P0 (section 16) makes
those measurements before any design here is treated as proven.

## 1. Problem

A creator wants one workflow that draws graphics at the display rate, 60 frames
per second, and produces a continuous 44.1 kHz audio stream. The same graph
also holds nodes that take seconds: image models, music models, file decodes.

```
Prompt ──▶ TextToImage (seconds) ══slot══▶ Displace ──▶ Glow ──▶ VideoOut
                                              ▲           ▲
                         Time ──▶ LFO ────────┘           │ level
MusicModel (seconds) ══slot══▶ Player ──▶ LowPass ──┬──▶ AudioOut
                                                    └──▶ Level
```

The native graph runner runs finite jobs. It cannot hold a deadline of 16.7 ms
for a frame or 2.9 ms for an audio block, and it has no path for data to enter
or leave a run on a clock (F1 to F3). This design adds that path and keeps the
finite kernel as it is.

## 2. Goals and non-goals

| Goal | Required behavior |
|---|---|
| G1 | A graph section draws one frame for each display refresh at 60 Hz and 1920×1080. No JavaScript runs on the frame path. |
| G2 | A graph section produces a continuous stereo stream at 44.1 kHz or 48 kHz. The audio threads make no lock, allocation, log or I/O call. |
| G3 | Picture and sound share one clock. A value derived from the sound reaches the picture within one refresh period of the time when that sound is audible (D7h). |
| G4 | Slow nodes stay asynchronous. A result enters a realtime section at a tick boundary and never delays a tick. |
| G5 | An edit replaces the running plan without a gap or a click. The state of an unchanged node survives and advances once for each tick. |
| G6 | The same plan renders offline with exact time, for export and for tests. One build gives the same bytes on each run from the same recorded inputs. Agreement between hosts has three stated levels (section 15.1). |
| G7 | The plan format and the audio kernels also run in the browser later, on WebGPU and an AudioWorklet. |
| G8 | Every part runs headless: a null audio device, a software GPU adapter, no window. |

Non-goals:

- Live audio input with less than 10 ms of latency. Section 10.2 keeps that
  path open and does not build it.
- 3D scenes, meshes and particle systems. The plan format reserves compute
  passes for them.
- An operator library of TiXL's size.
- MIDI, OSC, NDI, Spout and Syphon.
- A change to finite runs. A graph without a live output runs as it does today.
- Shared textures between the session and the native timeline.
- Use of TiXL code. The study covers its design only.

## 3. Findings

### 3.1 The graph runner today

- F1. A run accepts no data after it starts. `GraphRunner` has `submit` and
  `cancel` ([`graph_runner.h`][gr-h]), and `dispatchInputs` reads the params
  once at the start ([`runner.cpp`][gr-runner]).
- F2. The kernel schedules discrete messages and ends a run at quiescence. One
  worker thread owns the JavaScript engine and the actor loop. Native CPU, file
  and network jobs run on separate lanes ([README][gr-readme]). No step has a
  deadline.
- F3. At `15c446f645`, values cross the guest boundary as JSON strings, and
  bytes cross as base64. Uncommitted work in this worktree moves bytes to a
  binary blob type ([QuickJS review, PT13][qjs-review]). Structured values stay
  JSON text in both states.
- F4. The GPU host holds most of what a frame loop needs. It has a process-wide
  device on wgpu-native, the shader catalog as WGSL with bind group layouts and
  uniform layouts, cached pipelines, and textures that downstream shader nodes
  sample without a readback ([`gpu_device.h`][gr-gpu]).
- F5. Three parts are absent: a surface, texture reuse and a frame clock. A
  texture never changes after it is written, the engine retains at most 64 MiB,
  and an output leaves the runner as a PNG or as an RGBA8 readback.
- F6. The node-to-shader mapping is code. An image node computes its uniform
  values in `process()` and calls `runShaderNode`
  ([`lib-image-filter.ts`][img-filter]). A compiler cannot read that mapping
  without a run of the node.
- F7. The TypeScript shader package already has the frame-loop helpers
  `PipelineCache`, `ScratchPool` and `UniformRing` ([`context.ts`][gpu-ctx]).
- F8. The streaming audio nodes are JavaScript loops over `Float32Array` chunks
  ([`realtime-audio.ts`][rt-audio]).
- F9. Wasmtime is already a dependency of the runner, for the WebAssembly
  modules of the Code node.
- F10. The node editor is a Qt Widgets host. Its canvas is QtNodes, and its
  panels are Qt Quick scenes inside `QQuickWidget` ([README][ne-readme]). No
  single Qt Quick scene covers the window.

### 3.2 The native timeline

- F11. The audio engine uses miniaudio and three threads. The device callback
  never locks, allocates or decodes ([`AudioEngine.h`][tl-engine]). The engine
  takes a `Timeline` and mixes its clips, so the device layer is not a separate
  component today.
- F12. The clock is audio-master. The callback publishes a pair
  `(framesRendered, hostTimeNs)`, and a reader computes the audible position
  minus the output latency ([DESIGN D21][tl-design]). The exchange uses one
  seqlock for each writer and depends on the standard library only
  ([`AudioClockFeed.h`][tl-feed]).
- F13. `PcmRing` is a lock-free ring for one producer and one consumer.
  `TestAllocationCounter.h` counts heap allocations on a thread, for tests of
  the audio callback.
- F14. The preview is a `QQuickRhiItem` on the private QRhi API, which pins the
  build to one Qt minor version. Its shaders, the effects included, are GLSL
  files compiled by `qt_add_shaders`. The web timeline uses the WGSL catalog.
- F15. The preview already follows three rules that this design copies: an
  immutable snapshot crosses to the render thread, a replaced texture goes to a
  retire queue, and render targets come from a pool with a byte budget
  ([DESIGN D1, D11, D35][tl-design]).

### 3.3 TiXL

TiXL is a realtime motion graphics tool. Its runtime is C# with a native audio
library, and its operators are compiled C# classes.

- F16. Evaluation is a pull from the outputs with version counters. A slot is
  dirty when its source version differs from its value version. One pass for
  each frame walks the graph and raises versions only where an input changed or
  a slot is marked `Animated` or `Always` ([`DirtyFlag.cs`][tx-dirty],
  [`Slot.cs`][tx-slot]). A static subgraph costs one comparison for each slot.
- F17. Structure and values are separate. An operator can put a reference node
  on the wire in place of data. A downstream root walks those nodes and builds
  one shader or one set of native audio buses, and later frames only update
  parameters ([`ShaderGraphNode.cs`][tx-sgn], [`AudioGraphNode.cs`][tx-agn]).
  This is a compiled plan with a different name.
- F18. One evaluation context carries the time, the requested resolution and
  named variables down the graph. An operator can remap the time for its
  subgraph ([`EvaluationContext.cs`][tx-ctx]).
- F19. All audio runs in a native library on miniaudio. No managed code runs
  on an audio thread. C# sets parameters, rewires nodes and reads results once
  for each frame. The audio thread applies a rewire between blocks
  ([AUDIO_ARCHITECTURE.md][tx-audio]).
- F20. Analysis reads taps. Each source and bus has a mono history that a
  reader can sample without consuming it.
- F21. Export detaches the device and pulls the same audio graph once for each
  video frame, so an export sounds like live playback.
- F22. The frame timing notes record measured failures
  ([Plan_FrameTiming.md][tx-timing]). A frame latency of 2 gave a jitter of
  10.7 ms standard deviation, and a latency of 1 gave 0.075 ms. A time step
  measured in the middle of a frame made animation uneven under perfect
  presentation. The fix is a visual clock that advances by whole refresh
  periods and corrects its drift.
- F23. The same notes list about 30 hard-coded 60 Hz assumptions and about 45
  places that damp a value once for each frame. The decision was time-based
  integration everywhere, a fixed step for export and reference tests, and one
  display that paces the loop while other windows never block.
- F24. TiXL is leaving an operator model that exposes the Direct3D 11 state
  machine. The replacement is a backend API with cached pipelines and delayed
  resource destruction ([Plan_GraphicsFacade.md][tx-facade]).
- F25. TiXL accepts one evaluation thread and managed code on the frame path,
  under a rule of no allocation in that path. Its soundtrack plays freely and
  is seeked again when it drifts more than 40 ms from the visual clock.

### 3.4 Measurements

One kernel in five engines, on an Apple M4 Pro, at normal thread priority.
Appendix A gives the method. Both kernels run on blocks of 512 stereo frames.

| Engine | Biquad, ns per sample | Mix, ns per sample |
|---|---|---|
| Native, Apple clang 21 `-O2` | 2.79 | 0.047 |
| Native, `-O2 -ffp-contract=off` | 2.43 to 2.46 | 0.048 to 0.049 |
| Native, vectorizer off | 2.80 | 0.26 |
| Wasmtime 29.0.1, scalar | 2.45 to 2.48 | 0.40 |
| Wasmtime 29.0.1, SIMD128 | not applicable | 0.15 |
| V8 13.6 WebAssembly, scalar | 2.45 to 2.46 | 0.33 to 0.34 |
| V8 13.6 WebAssembly, SIMD128 | not applicable | 0.086 |
| V8 13.6 JavaScript | 2.51 to 2.53 | 0.69 to 0.70 |
| QuickJS-ng 0.18.0 | 40.1 to 40.5 | 20.9 to 21.0 |

- F26. On a recurrence such as a biquad filter, compiled WebAssembly equals
  native code. The loop is bound by the latency of its dependency chain, and
  SIMD does not apply.
- F27. On a loop that vectorizes, native code is 2 to 3 times faster than
  WebAssembly with SIMD128 and 7 to 8 times faster than scalar WebAssembly.
  The mix figures include the call cost: 62 ns for one `wasmtime_func_call` and
  11 ns for one call from V8.
- F28. QuickJS is 16 times slower than the compiled engines on the biquad and
  445 times slower than native code on the mix.
- F29. Throughput alone does not exclude QuickJS for a small graph. Eight
  stereo biquads on 512 frames took 0.33 ms, which is 2.8% of that block's
  11.6 ms. The exclusion comes from F2: one engine, one owner thread, no bound
  on a step.
- F30. Native code without fused multiply-add gives the same checksum as both
  WebAssembly engines. Native code with the default contraction differs in the
  sixth digit.

### 3.5 Review of revision 1

A design review of revision 1 found these gaps. Each row names the place that
now resolves it.

| Finding | Gap in revision 1 | Resolved in |
|---|---|---|
| F31 | A swap rendered one quantum from the old and the new audio plan on the same node state. A player, an oscillator or a filter then advances twice | 11.3, O7 |
| F32 | A param change reached the picture in the next frame and the sound after the ring lead. A plan swap had the same offset | D7g, 11.1, 11.2 |
| F33 | Damping, an envelope, an integrated oscillator and stateful noise are not functions of the time. One copy at 60 Hz and one at 344.5 Hz diverge | D15, 5.4 |
| F34 | An epoch deadline needs a second thread that advances the epoch, and a browser has no such call. An endless loop inside a worklet call cannot be stopped | 10.6, O8 |
| F35 | A module without imports has its own memory. Samples cannot reach it from a native buffer without a copy | 10.5, 10.6 |
| F36 | `SeqLock` has a bounded `tryLoad` and an unbounded `load` ([`AudioClockFeed.h`][tl-feed]). A full retire queue and a value that two domains release had no rule. One ring cannot feed the device and a recorder | 10.4, 11.4 |
| F37 | A skipped pass needs its output from an earlier frame. A pool that assigns textures by liveness inside one frame can overwrite that output | 9.4, 9.5 |
| F38 | A thread-safe device does not bound the wait behind another submission, a pipeline compile or a queue backlog | 9.2, R2 |
| F39 | "0 frames of error" ignored the presentation estimate, the analysis window and a late analysis value | G3, D7h, 13 |
| F40 | Equal checksums for two kernels on one input do not show parity for other kernels | N6, 15.1 |
| F41 | A 99th percentile leaves about 2,070 of the 206,700 quanta of a 10 minute run without a limit | 13 |
| F42 | The IR named a texture format and no color space, alpha mode or channel layout. The sample rate and the quantum were fixed values | 6.2, 10.1 |
| F43 | The render executor was tied to its own surface. The browser render executor was fixed without a comparison | D14, 9.2, 14.5, Q8 |

### 3.6 Review of revision 2

A second review checked revision 2 against the graph runner and timeline code:

| Finding | Gap in revision 2 | Resolved in |
|---|---|---|
| F44 | `wgpuDevicePushErrorScope` is a device-wide stack, and `wgpuQueueWriteBuffer` and `wgpuQueueWriteTexture` stage onto the next submission on the shared queue ([`gpu_device.cpp`][gr-gpu-cpp]). Concurrent calls from the prepare, render and batch threads race | 9.2, 9.6 |
| F45 | `GraphRunner` runs one job at a time and calls `releaseRunResources` at the end of a run ([`graph_runner.cpp`][gr-cpp], [`gpu.cpp`][gr-gpu-host]). A compiler call queued behind a batch job waits for it, a texture from a batch run is destroyed at run end, and a media ref from a model node is not a GPU texture or planar PCM | 5.5, 9.5, 10.4, 14.1 |
| F46 | A dual-plan revision that waits on the render thread for an applied notice can be overwritten in a single-slot handoff within the ring lead, or wait forever when a notice is dropped or the device re-anchors | D7g, 11.1, 11.2 |
| F47 | A stateful control operation that feeds the render plan only was stepped on the audio thread and delayed by the ring lead. Stateful control operations had no state key for a swap or for adding or removing the audio plan | D15, 5.4, 6.2, 11.3 |
| F48 | An offset ramp from `old[last] - new[0]` duplicates the last sample and adds a step proportional to the slope on a continuous wave. Running it on every swap also breaks byte equality when the audio path is unchanged | 6.2, 11.3 |
| F49 | A retire queue that waits for answers from both domains stalls when a domain is inactive or when one tick replaces several slots | 11.4 |
| F50 | The lifetime order and thread affinity between `GraphRunner` and `LiveSession` were not stated against the [native rules][native-rules] | 7, 14.1 |
| F51 | Advancing the visual clock by `k` refresh periods after a pause or an idle frame skip counts the pause as stream time or missed frames | D7c, 9.4, 9.7 |

## 4. Decision

```
 workflow graph
      │
      ▼
 plan compiler (TypeScript, runner worker)      finite kernel (unchanged)
      │  plan IR                                 batch regions: models, decode, scripts
      ▼                                                 │ results
 prepare thread: pipelines, textures, kernel state      ▼
      │  prepared plans            ┌──────────── slots: texture, buffer, value
      ├──────────────────────┐     │
      ▼                      ▼     ▼
 render thread           audio render thread ──▶ ring ──▶ device callback
 vsync, wgpu-native      128-frame quanta                 copy, clock pair
      ▲                      │
      └── signal history ────┘   analysis values, indexed by stream time
```

- D1. Keep the finite kernel. Add a live session that owns two compiled plans,
  a render plan and an audio plan.
- D2. Find the live part of a graph by a pull from its live outputs, as TiXL
  evaluates from its outputs (F16).
- D3. One compiler, in TypeScript, turns a graph into a plan IR. Each host has
  its own executors for that IR.
- D4. The render executor uses wgpu-native and presents on its own surface in a
  native window. Section 9.1 compares this with QRhi.
- D5. The audio executor runs fixed quanta of 128 frames on a realtime thread
  that the engine owns. miniaudio stays the device layer.
- D6. Built-in kernels are native code. Pixel work is WGSL. JavaScript sets
  values and never computes a sample or a frame (section 12). Kernels that
  arrive as data are WebAssembly. They come in a later phase and run off the
  deadline threads (section 10.6).
- D7. The audio stream is the master clock. The picture follows a visual clock
  locked to it. Values cross between the two domains by stream time. A change
  that the sound consumes reaches the picture when it is audible (D7g).
- D8. The render plan tracks versions, so an unchanged pass does not run (F16).
- D9. A new plan replaces the old plan at a tick boundary. One plan of a
  domain runs in each tick, so node state advances once. State follows the
  node's identity while its state key is equal (section 11.3). Old plans are
  destroyed off the realtime threads.
- D10. Slots carry the results of slow nodes into the plans.
- D11. Offline mode drives the same executors with exact time (F21).
- D12. All time-dependent behavior uses seconds or beats. No kernel, control
  operation or shader uses a per-frame constant (F23).
- D13. The engine is a new project, `native/realtime`, with no Qt and no
  QuickJS dependency. The audio device and clock layer moves from the timeline
  into a shared library.
- D14. The render executor draws into a texture view and owns no surface. A
  presenter shows the result: a surface of the session, or a target that the
  host passes inside its own frame (section 9.2).
- D15. A stateful control operation runs in one domain, in fixed steps of one
  quantum of stream time. One that reaches the audio plan runs on the audio
  thread when an audio plan is active. One that reaches the render plan only
  runs on the render thread (section 5.4).

Rejected alternatives:

| Option | Reason for rejection |
|---|---|
| O1. Run the finite kernel once for each frame | Each run pays for lineage, correlation, JSON and messages (F2, F3), and no step has a bound. |
| O2. Give the guest WebGPU and WebAudio APIs and keep all logic in JavaScript | F28, and one stalled script would stop sound and picture together. |
| O3. Render on QRhi inside a Qt Quick item | Section 9.1. |
| O4. Compile every audio kernel to WebAssembly on the desktop too | F27. It also makes Wasmtime a required dependency on every platform. |
| O5. Use miniaudio's node graph as the audio executor, as TiXL does | The plan must be data that two hosts execute the same way, with a fixed quantum for exact offline results (G6, G7). |
| O6. Load native plug-ins for user kernels | A fault ends the host process. The VST host already runs as a child process for that reason. |
| O7. Crossfade the old and the new audio plan at a swap | Each node downstream of the edit needs a second state block, and both paths cost CPU in the quantum of the edit (F31). Section 11.3 removes the click with one plan. |
| O8. Guard the audio deadline with epoch interruption | The trap needs a second thread and can arrive after the deadline. A browser has no such call (F34). |

## 5. Execution model

### 5.1 Terms

| Term | Meaning |
|---|---|
| Live output | A sink node that presents: `VideoOut` or `AudioOut`. The names are proposals. |
| Live region | The nodes that feed a live output and have a realtime implementation. |
| Batch region | Every other node. The finite kernel runs it. |
| Plan | An immutable compiled program for a live region. A session has one render plan and one audio plan. |
| Session | A long-lived object that owns the plans, the clock, the device and the surface. |
| Slot | A named place where a batch result enters a plan. |
| Tick | One frame for the render plan, one quantum for the audio plan. |

### 5.2 Edge kinds

| Kind | Value | Evaluated | Thread |
|---|---|---|---|
| Audio | Planar float32, one quantum of frames | Each quantum, 344.5 times a second at 44.1 kHz | Audio render |
| Texture | A GPU texture | Each frame | Render |
| Control | Scalar, vector, color or boolean | Analytic: once for each tick of its consumer. Stateful: once for each quantum of stream time (section 5.4) | Render or audio render |
| Event | A discrete message with a stream time | At its time | The consumer's thread |
| Latched | Any value from a batch node | When the batch node completes | Runner worker, then a slot |

### 5.3 Live regions

1. Start at each live output and walk upstream.
2. A node joins the live region when its class declares a live descriptor
   (section 6.1) and each input kind is available at its rate.
3. The walk stops at a node without a descriptor. The edge that leaves that
   node becomes a slot.
4. A node that reaches no live output is not part of the session.

A cycle inside a live region must pass through a delay. For textures that is a
`FrameDelay` node, which gives the previous frame. For audio it is a
`BlockDelay` node of one quantum or more. The compiler rejects other cycles.

A batch node can also read from a live region. That boundary is a tap with a
policy: on request, at an interval, or each time the batch region is idle. The
tap copies one frame or a span of audio and starts a normal run.

### 5.4 Control operations

A control operation has one of two classes. Its descriptor declares the class.

| Class | Operations | Rule |
|---|---|---|
| Analytic | Constants, time sources, arithmetic, comparison, remap, vector packing, an oscillator with a constant rate, noise that is a hash of the time | A pure function of its inputs and the stream time. It gives the same value in each domain |
| Stateful | Damping, envelopes, an oscillator with a modulated rate, sample-and-hold noise, integrators, counters | It has memory. It runs in one domain only, in fixed steps (F33) |

The compiler places an analytic operation in the domain of its consumer, and
in both domains when both consume it. An analytic operation can take a
stateful value as an input.

A stateful operation advances once for each quantum of stream time (D15). The
count of steps comes from the stream time and never from the frame count or
the wall clock. Its domain depends on the consumers it reaches (F47):

- When it reaches the audio plan (alone or with the render plan) and an audio
  plan is active, the audio thread runs the step in each quantum. When it also
  reaches the render plan, the audio thread writes `(streamTime, value)` to the
  signal history, and each param that feeds it gets the `Synced` policy
  (section 11.1).
- When it reaches the render plan only, or when the session has no audio plan,
  the render thread runs each step that ends at or before the audible time of
  its frame. An `Immediate` param that feeds a render-only stateful operation
  then takes effect in the next frame instead of waiting for the ring lead.
- Offline mode follows the same two rules with the exact clock.

A stateful value thus has one sequence of values in all three cases. A frame
rate of 60 Hz or 120 Hz changes which entries a frame reads and not the
entries. The operation is written against the step length in seconds (D12),
so a session at 48 kHz follows the same curve.

After a stall, the render thread runs at most 0.25 s of missed steps. It skips
the rest and counts the skip (R12).

A value crosses between the domains as follows:

- Audio to render: the audio thread writes `(streamTime, value)` pairs to a
  signal history, once for each quantum. The render thread reads the newest
  entry at or before the audible time of its frame (D7h).
- Host or worker to a plan: the value is a param change (section 11.1).

No control value goes from the render thread to the audio thread.

The executor is a register machine: a flat list of operations with register
indexes, without allocation. The same C++ source serves both domains.

### 5.5 Session and the finite kernel

A session does not replace a job. The compiler rewrites each batch region so
that its boundary outputs end in an internal slot-write node, implemented in
C++ as `output_node.cpp` is. The kernel runs that region as an ordinary job. When
a creator edits an input of a batch node, the host runs the affected subgraph
again, and the new result replaces the slot value. The session keeps running
through each of these runs.

`GraphRunner` runs one job at a time on its worker thread and releases the
run's resources when the job ends ([`graph_runner.cpp`][gr-cpp], F45). Three
rules keep live edits and slot values independent of that lifecycle:

1. A session compiler call is scheduled on the worker's `Loop` between actor
   steps rather than queued behind `GraphRunner`'s jobs. While a batch node
   waits on a provider, CPU or I/O lane, `LiveSession::update` compiles the
   edited graph on the next loop turn and starts any newly dirtied batch
   subgraph.
2. When a batch node outputs an in-process GPU texture (`image/x-gpu-texture`),
   the slot-write node detaches that texture ID from `ContextGpu`'s per-run
   table ([`gpu.cpp`][gr-gpu-host]) and moves it into the session's texture
   account before `releaseRunResources` runs at the end of the job.
3. When a batch node outputs an encoded image or audio reference (`data`,
   `uri` or `asset_id`, such as `TextToImage` or `MusicModel`), the slot-write
   node hands the reference to the prepare thread. The prepare thread decodes
   the image on the CPU lane and uploads a premultiplied texture through the
   submit gate (section 9.2), or decodes and resamples the audio to planar
   `float32` at `session.sampleRate` (section 10.4), and then publishes the
   immutable slot value.

This agrees with the [reactive sessions plan][rs-plan], which names an
interaction lifetime and adds no workflow executor. The live plans are the one
new executor, and they run compiled regions only.

## 6. Plan compiler

The compiler is TypeScript in a shared package. It runs in the guest on the
runner worker and, later, in the browser. It is not time-critical: it runs
once for each edit.

### 6.1 Live descriptors

A node class declares one static descriptor. The descriptor has three forms:

| Form | Content |
|---|---|
| `shader` | A catalog module key and one expression for each uniform field |
| `dsp` | A kernel id, port layout and one expression for each kernel param |
| `control` | A control operation id |

An expression is a small tree of control operations over the node's
properties, built with a TypeScript helper. `Posterize` states
`levels = pow(2, round(clamp(bits, 1, 8)))` as data, where it computes that
value in `process()` today (F6). The compiler folds an expression whose
properties are constants. An expression with a connected control input becomes
part of the control plan, so the uniform can change each frame without
JavaScript.

A first set of node types can be generated from the shader catalog, one type
for each published module with its uniform fields as properties.

### 6.2 Plan IR

The IR is one JSON document. It is illustrative here and not final:

```json
{
  "revision": 12,
  "session": { "sampleRate": 44100, "quantum": 128, "channels": "stereo",
               "width": 1920, "height": 1080, "seed": 1 },
  "params": [{ "slot": 0, "node": "a1", "field": "cutoff", "smooth": "ramp",
               "sync": "audio" }],
  "slots": [{ "id": "t0", "kind": "texture", "source": "n2.output",
              "colorSpace": "encoded-sdr", "alpha": "premultiplied" }],
  "control": { "registers": 24,
               "ops": [["time.beats", 0], ["osc.sine", 1, 0]],
               "stateful": [{ "node": "c1", "op": "damp", "stateVersion": 1,
                              "domain": "render", "out": 2, "in": [1] }] },
  "render": {
    "passes": [{ "node": "n4", "module": "filters/blur@1", "inputs": { "src": "t0" },
                 "uniforms": [1], "retention": "volatile",
                 "output": { "format": "rgba8unorm", "size": "session",
                             "colorSpace": "encoded-sdr", "alpha": "premultiplied" } }],
    "present": { "source": "n4", "colorSpace": "srgb" }
  },
  "audio": {
    "buffers": [{ "id": 0, "channels": "stereo" }, { "id": 1, "channels": "stereo" }],
    "nodes": [{ "node": "a1", "kernel": "biquad.lowpass", "stateVersion": 1,
                "in": [0], "out": [1], "params": [0] }],
    "sinks": [{ "buffer": 1, "kind": "device", "subgraphHash": "7a3c91f0" }]
  }
}
```

Rules:

- A pass, an audio node, a stateful control operation and a param each name the
  graph node they come from. That name is the identity for state and for error
  reports (D9, F47).
- Each audio sink carries `subgraphHash`, the hash of the upstream audio nodes,
  edges and state keys that feed it, so the executor knows when an edit leaves
  that sink's path unchanged (F48).
- Param slot numbers stay the same across revisions for an unchanged node and
  field.
- Each texture edge carries the output contract of its module: format, size
  rule, color space tag and alpha mode (F42). The tags are `ColorSpaceTag` and
  `AlphaMode` of the shader package ([`types.ts`][gpu-types]). Textures
  between passes hold premultiplied alpha, as that package requires.
- The compiler compares each edge with the input contract of its consumer. It
  adds the catalog's conversion pass for an alpha mismatch, as the TypeScript
  executor does. It reports a color space mismatch as a warning, because the
  catalog has no color conversion modules yet and the TypeScript executor
  defers that check for the same reason.
- `rgba16float` adds precision and no HDR meaning. Color work stays in SDR, as
  D3 of the [color precision plan][color-plan] decides. The `present` entry
  names the color space of the target, so a later HDR output has a place for
  its transfer function.
- `session.sampleRate` is 44100 or 48000, and `session.quantum` is 128. Both
  are data. No kernel and no control operation holds either value as a
  constant, so another rate or quantum changes the IR and no code.
- Each audio buffer names its channel layout, mono or stereo in this version.
- The compiler orders passes and audio nodes topologically and assigns audio
  buffers by liveness, so the executors do no graph work.
- The compiler reports each node that stopped the walk and why. The editor can
  show which nodes run live.

### 6.3 Validation

The compiler rejects a plan with a cycle that has no delay, a kind mismatch on
an edge, a channel layout mismatch on an audio edge, or an unknown module or
kernel. The prepare step rejects a plan whose
shader fails to compile or whose resources exceed the session budget. A
rejected plan never becomes active, and the previous plan keeps running.

## 7. Threads and ownership

| Thread | Owns | Never does |
|---|---|---|
| Runner worker (exists) | The JavaScript engine, the kernel loop, the compiler call, batch runs | Touch a plan after it is handed over |
| Prepare (new, one for each session) | Plan construction: pipelines, textures, kernel state. Destruction of retired plans and slot values. The device poll and its callbacks | Run inside a frame or a quantum |
| Render (new) | The active render plan, the surface presenter, frame resources, the visual clock, the control registers of its domain | Wait for the worker, compile a shader, allocate in steady state |
| Audio render (new) | The active audio plan, the control registers of its domain, the write side of the output ring | Lock, allocate, log, do file or network I/O |
| Device callback (miniaudio) | The read side of the ring, the clock pair | Anything except a copy and the clock write |
| Analysis (new, optional) | FFT state, the read side of a tap ring, the write side of a signal history | Run on the callback |
| Host GUI | The window and the transport controls | GPU or audio calls |

With a host target (D14), the host's render thread takes the role of the
render thread for the length of each `renderFrame` call.

Ownership and thread affinity, as [native rules 1, 9 and 16][native-rules]
require (F50):

- `GraphRunner` must outlive every `LiveSession` it opens.
- `LiveSession` is held by the host in a `std::unique_ptr`. It shares a
  `std::shared_ptr<SessionToken>` with its in-flight batch runs and slot-write
  nodes on the runner worker, because a batch run on the worker can outlive a
  cancellation request until `Loop` drains it.
- `~LiveSession()` marks the token closed, cancels its batch runs on
  `GraphRunner`, stops the device, joins the audio render, render and prepare
  threads in that order, and then destroys the plans and state store. A
  slot-write node or callback that settles after the token closes drops its
  result.
- Control and surface calls (`update`, `setParam`, `play`, `pause`, `reset`,
  `resizeSurface`, `detachSurface`) run on the host GUI thread. `renderFrame`
  runs on the host render thread. `stats` is thread-safe over seqlocks.
- A plan is immutable after construction and is held in a `std::unique_ptr`.
  It moves from the prepare thread to its realtime thread through a
  single-slot handoff, and back through a retire queue. Only the prepare
  thread destroys it. Section 11.4 bounds that queue.
- Node state lives in a state store that the session owns. The prepare thread
  alone adds and removes entries. A plan holds non-owning pointers, and the
  store removes an entry only after the last plan that names it is retired.
- A GPU texture has one RAII handle. A pooled texture returns to its pool
  through that handle's destructor.
- A slot value is immutable. A new value replaces it by a pointer exchange at
  a tick boundary, and the old value goes to the retire queue.
- The surface description is non-owning. The host owns the window and calls
  `detachSurface` before it destroys the window. That call returns after the
  render thread released the swapchain.

## 8. Clock

- D7a. Session time is a count of stream frames. Seconds are frames divided by
  the sample rate. Beats come from the tempo and an anchor pair, as the
  timeline anchors play, seek and rate changes ([DESIGN D21][tl-design]).
- D7b. Three sources give the time:

  | Source | Used when | Time for a tick |
  |---|---|---|
  | Audio | A device runs | The audible position of F12 |
  | Monotonic | No audio device | Elapsed monotonic time |
  | Exact | Offline | Frame index divided by the frame rate, and quantum index times 128 |

- D7c. The render thread does not use the audio position directly, because its
  interpolation between callbacks jitters (F22). It keeps a visual clock:
  1. When playback starts (`play`), resets (`reset`), re-anchors on an audio
     device change, or resumes after a frame that had no work (section 9.4),
     anchor the visual clock to the audio position predicted for the
     presentation time, or to elapsed monotonic time when no audio device runs
     (F51).
  2. In each consecutive active frame while playing, advance by `k` refresh
     periods, where `k` is the count of periods since the last active frame.
  3. Compute the error against the audio position predicted for the
     presentation time.
  4. Remove a small part of the error each frame. That absorbs the drift
     between the audio device and the display.
  5. When the error exceeds half a period, correct it in one step and count
     the correction.
- D7d. The refresh period is measured and never assumed. The first estimate
  comes from the display mode.
- D7e. The presentation time of a frame is the present call plus a display
  latency. The default is one refresh period, and the host can set an offset
  in seconds for each output device.
- D7f. The tick context gives each operation `seconds`, `beats`, `dt`, `frame`
  and the output size. An operation that integrates uses `dt`.
- D7g. A change that the sound consumes has an effective stream time (F32, F46).
  At the start of each quantum the audio thread applies due changes and writes
  its applied state `(planRevision, clockGeneration, streamFrame)` and per-slot
  applied param revisions to a seqlock. The render thread applies a synced
  change in the first frame whose audible time reaches that stream frame for
  the matching `clockGeneration`, or immediately when `clockGeneration`
  changed, the audio device stopped, or the audio thread already advanced past
  that revision. This rule covers a synced param (section 11.1) and a revision
  that changes both plans (section 11.2). The sound is never delayed for the
  picture. When the picture path is the slower one, the picture is late by the
  difference.
- D7h. The match between sound and picture has a tolerance and no guarantee
  (F39):
  - The timestamp of an analysis value is the stream time of the last frame of
    its window. A spectrum of 1,024 frames describes the 23.2 ms before its
    timestamp.
  - The render thread reads the newest entry at or before the audible time of
    its frame. It never extrapolates.
  - An analysis value is late when it is not in the history at that read. The
    frame then uses the entry before, and the stats count a late read.
  - An entry older than 100 ms is stale. The consumer holds it, and the stats
    count a stale read.
  - The target is one refresh period between a sound and the frame that shows
    it, 16.7 ms at 60 Hz. The error has three parts: the quantum of 2.9 ms,
    the estimate of the display latency (D7e) and the correction of the visual
    clock (D7c). The session cannot observe the light of the display, so P0
    measures this value with a camera and a microphone.

The ring lead helps this match. The audio for a stream time is produced before
it is audible, by the ring lead plus the device latency. Its analysis value is
therefore in the signal history before a frame asks for that time, unless the
analysis step takes longer than the lead (D7h). The lead also delays the
response of the sound to a control change.

## 9. Render plan

### 9.1 Why wgpu-native and not QRhi

QRhi inside a Qt Quick item is the nearest alternative, because the timeline
preview uses it (F14). Four findings decide against it:

1. The shader catalog is WGSL with layouts that are tested against typegpu
   (F4). QRhi takes shaders from Qt's own tool chain. A second chain means a
   translation step and a second implementation of the catalog rules. The
   timeline already keeps its effect shaders as separate GLSL files (F14).
2. The node editor has no Qt Quick scene that covers the window (F10). A
   `QQuickRhiItem` inside a `QQuickWidget` renders on the GUI thread into an
   offscreen target, which puts the GUI thread on the frame path.
3. The browser executes the same catalog on WebGPU (G7). One shader language
   and one set of rules then serve three hosts.
4. The engine stays free of Qt and of a private API pinned to one Qt minor
   version (F14, G8).

The cost is one native window for the picture. Qt items cannot draw over it,
so controls sit beside the picture or in a separate child window. A later
session inside the timeline needs a texture exchange between wgpu and QRhi,
which this design does not provide.

### 9.2 Device, presenters and the shared queue

The render executor draws a frame into a texture view that it is given (D14).
A presenter supplies that view:

| Presenter | Target | Pacing | Use |
|---|---|---|---|
| Surface (first) | A surface that the session configures on a host window | `Fifo` on the first surface | The node editor (section 14.2) |
| Host target | A texture view that the host passes for each frame | The host calls `renderFrame` inside its own frame | A host that draws its interface on the same device, such as an RmlUi or Dear ImGui editor |
| Texture | A texture of the session | None | Offline mode and tests |

Surface rules:

- The host passes a surface description: a Metal layer, a window handle, or an
  X11 or Wayland surface. The pinned header has these sources and the calls
  `wgpuSurfaceConfigure`, `wgpuSurfaceGetCurrentTexture` and
  `wgpuSurfacePresent`.
- The session checks that the device's adapter can present to the surface. If
  it cannot, the open call fails with that reason.
- The first surface paces the loop with `Fifo`. A later surface uses `Mailbox`
  and never blocks (F23).

Device rules:

- The session uses the process-wide device of the GPU host, so a texture from a
  batch node can become a slot value without a copy. It receives the device
  through a typed context object, not through the `compute` callback that
  carries a native-rules marker ([`gpu_device.h`][gr-gpu]).
- A host target is a view of a texture on that device. A host with a device of
  its own needs a texture exchange, which this design does not provide (R4).

A thread-safe device is not an isolated device (F38). A frame can wait behind
a batch submission, behind a pipeline compile in the driver, or behind a queue
backlog. The application has no portable deadline or preemption guarantee on a
GPU queue. The GPU host submits and polls under its own mutex today. During a
session these rules replace that:

1. Every queue write (`wgpuQueueWriteBuffer`, `wgpuQueueWriteTexture`) and
   command buffer submission on the device goes through one gate that the
   session owns (F44). Batch code either writes into mapped staging buffers and
   records `CopyBufferToBuffer` or `CopyBufferToTexture` in its command buffer,
   or passes its queue writes and command buffer to the gate as one unit, so a
   batch upload never stages onto `WGPUQueue` ahead of a frame submit.
2. The render thread writes its uniform block and submits its frame together
   under the gate first. After the present call the gate submits at most one
   batch unit. The next one waits until `wgpuQueueOnSubmittedWorkDone` reports
   the one before. At most one batch submission is thus ahead of a frame.
3. A batch texture becomes a slot value only after its submission completed.
   A frame never waits for the work that produces its input.
4. Device-wide error scopes (`wgpuDevicePushErrorScope` and
   `wgpuDevicePopErrorScope`) are not used concurrently across threads (F44).
   The prepare thread checks shader compilation with
   `wgpuShaderModuleGetCompilationInfo` and creates pipelines with
   `wgpuDeviceCreateRenderPipelineAsync` and
   `wgpuDeviceCreateComputePipelineAsync`, reading errors from their status
   callbacks. A plan becomes active after each of its pipelines is ready.
5. The prepare thread alone polls the device, so no device callback runs on
   the render thread. A batch readback waits for its callback and does not
   poll.
6. The prepare thread releases a retired texture or buffer. Commands that were
   submitted before the release still complete, as WebGPU requires.

These rules limit the backlog. They do not make one long batch command buffer
short. P0 measures the frame intervals during a batch GPU workload in three
setups: with the gate, without it, and with a second device for batch work. A
second device separates the queues and costs a CPU copy for each texture slot
value.

### 9.3 Frame order

1. Check for work (section 9.4). Without work, wait one refresh period and
   start again.
2. Acquire the target. With a surface under `Fifo` this call paces the loop.
3. Read the clocks and build the tick context.
4. Apply a pending plan, slot values and each param change that is due (D7g).
5. Run the control plan.
6. Encode each dirty pass, write the uniform block once, and submit one
   command buffer.
7. Present.
8. Publish the frame stats and move replaced resources to the retire queue.

The time is read after the acquire, so it is as close to the presentation as
the loop allows. TiXL evaluated its outputs before its clock update and showed
the previous frame's time (F22).

### 9.4 Dirty tracking and retention

Each pass has a version. A pass is dirty when one of these holds:

- The version of an input changed.
- A uniform expression gave a new value.
- A slot got a new value.
- Its output size changed.
- Its output is not valid.

Dirty tracking and texture lifetime follow one rule (F37): a pass is skipped
only when it is clean and its output from an earlier frame is still valid. The
compiler gives each pass a retention class for that:

| Class | Pass | Output texture |
|---|---|---|
| Volatile | A pass that reads the time, a signal history, a video source or a feedback node, and each pass downstream of one | From the frame pool, assigned by liveness inside the frame. Not valid after the frame |
| Retained | Every other pass | Owned by the pass across frames. Never in the frame pool |

- A volatile pass runs in each frame while the transport runs.
- A retained output counts against the texture budget (section 9.5). Over the
  budget, the session evicts the retained output that was read least recently
  and marks it not valid. The pass runs again when a consumer needs it.
- A frame that needs the output of a volatile pass from an earlier frame runs
  that pass again. This occurs when a param changes while the session is
  paused. The time is the same, so the picture is the same.
- A feedback node advances once for each frame while the transport runs, also
  when its inputs are static. It holds its textures while the session is
  paused. Its result depends on the frame rate, and offline mode fixes that
  rate.
- The present step is dirty when a pass of its chain ran, when the surface was
  configured again, when the window was exposed, or when the render scale
  changed. A resize also changes the output size of each pass that takes the
  session size.

Before it acquires a target, the render thread checks for work. Work exists
when the transport runs and the plan has a volatile pass, when a plan, slot or
param change is due, or when the surface changed. Without work the thread
acquires nothing and presents nothing. The window keeps its picture, as the
timeline holds its last frame. A paused session then uses no GPU time. The
first active frame after an idle skip re-anchors the visual clock instead of
advancing by the skipped refresh periods (D7c, F51).

### 9.5 Resources

- The prepare thread creates every pipeline before a plan becomes active. A
  shader compile never runs on the render thread.
- A retained pass owns its output texture. Volatile passes share the frame
  pool (section 9.4).
- A feedback pair is two textures that the feedback node owns. They swap once
  for each frame while the transport runs.
- One uniform buffer holds all blocks of a frame.
- Bind groups are cached for each pass and input set.
- The session has a texture budget, 512 MiB by default as the timeline's
  surface pool has. It is separate from the 64 MiB limit of batch textures. An
  in-process batch texture that moves into a slot is detached from `ContextGpu`
  before `releaseRunResources` runs (section 5.5, F45), leaves the run's
  account and enters the session's account. An encoded image reference from a
  batch node is decoded and uploaded on the prepare thread inside the session's
  account.
- Retained outputs, feedback pairs and the frame pool all count against the
  budget. The prepare step rejects a plan whose frame pool and feedback pairs
  alone exceed it.
- The format, color space tag and alpha mode of a target come from the output
  contract in the IR (section 6.2). The default format is `rgba8unorm`. A pass
  can request `rgba16float`, which feedback chains need to avoid banding.
- WebGPU orders queued commands, so the reuse of a target in the next frame
  needs no fence. Readbacks are the exception: export and taps use a ring of
  three staging buffers and map them without a blocking poll.

### 9.6 Custom shaders

A custom shader node takes WGSL for one fragment function. The compiler adds
the standard inputs: time, resolution and the bound textures. The prepare
thread compiles the module and checks `wgpuShaderModuleGetCompilationInfo` and
the async pipeline creation status without pushing a device-wide error scope
(section 9.2, F44). An error goes to the node, and the previous plan keeps
running.

### 9.7 Load control

- Timestamp queries give the GPU time of each pass when the adapter has the
  feature. The editor can show the cost of each node.
- A frame that misses its refresh between two consecutive active frames while
  playing advances the visual clock by `k` periods (D7c, F51). The motion keeps
  its speed, and the stats count the miss.
- In adaptive quality mode, the session lowers the render scale from 1 to 0.75
  to 0.5 when misses persist, and raises it again after a period with
  headroom. The scale steps match the timeline's preview quality.

## 10. Audio plan

### 10.1 Quantum and kernels

The plan runs in quanta of 128 frames, 2.9 ms at 44.1 kHz and 2.7 ms at
48 kHz. The Web Audio render quantum has the same default length, so a browser
executor processes one plan quantum for each worklet call (G7). A fixed
quantum also makes an offline render independent of the device buffer size
(G6).

The quantum and the sample rate are session values in the IR and not constants
in a kernel (F42). The session rate is 44.1 kHz or 48 kHz. A kernel reads the
frame count from its arguments and the rate from its config. The
[Web Audio 1.1 draft][webaudio-11] lets a context ask for another render
quantum size. The worklet adapter therefore accepts a call of any length and
feeds whole quanta through a FIFO.

A kernel is a C interface. This sketch is not final:

```c
typedef struct nt_dsp_args {
  const float* const* in;      /* [port * channels], `frames` each */
  float* const* out;
  const float* param_begin;    /* value at the first frame */
  const float* param_end;      /* value at the last frame */
  const nt_dsp_event* events;  /* sorted by frame offset */
  uint32_t event_count;
  uint32_t frames;             /* the session quantum */
  uint64_t stream_frame;       /* position of frame 0 */
} nt_dsp_args;

typedef struct nt_dsp_kernel {
  uint32_t abi;
  uint32_t state_version;      /* part of the state key, section 11.3 */
  uint32_t (*state_size)(const nt_dsp_config*);
  void (*init)(void* state, const nt_dsp_config*);
  void (*process)(void* state, const nt_dsp_args*);  /* realtime rules */
} nt_dsp_kernel;
```

`nt_dsp_config` holds the sample rate, the quantum, the channel layout of each
port and the structural params of the node. The host allocates the state as
one flat block and clears it before `init`. A kernel therefore never
allocates, and its state can follow the node across plans (D9). In a
WebAssembly build of the executor the block lies in the module memory, and
each pointer is an offset into that memory (section 10.5).

The first kernels are an oscillator, noise, gain, mix, the biquad family, a
delay, a sample player that reads a buffer slot, and a level meter.

### 10.2 Drivers

The executor is one function: render the next quantum. A driver decides which
thread calls it.

| Driver | Thread | Use |
|---|---|---|
| Buffered (first) | An audio render thread of the engine fills a ring. The device callback copies from the ring and writes the clock pair | Generated sound and reactive visuals |
| Offline (first) | The export loop | Export and tests |
| Direct (later) | The device callback | Live input, where the ring lead is too long |

Reasons for the buffered driver first:

- The engine owns the thread and sets its priority class once, outside a
  device callback.
- One late quantum does not cause an underrun.
- A recorder or a stream encoder reads a ring of its own, which the same
  thread fills (section 10.4).
- Buffering does not shift the picture against the sound, because values and
  changes cross by stream time (D7g, D7h).

Parameters:

- The ring lead defaults to two device periods and at least 8 quanta, about
  23 ms.
- The thread requests the platform's realtime class: a time-constraint policy
  and the device workgroup on macOS, MMCSS on Windows, `SCHED_FIFO` on Linux. A
  refused request appears in the stats, and the session continues.
- The session opens the device at the session rate: 44.1 kHz by default, or
  48 kHz. miniaudio converts when the hardware runs at another rate.
- The ring adapts any device period to the quantum. The direct driver needs a
  FIFO of up to one quantum when the device period is not a multiple of the
  quantum.
- All kernels obey the callback rules from the start, so the direct driver
  stays possible.

### 10.3 Params and events

- At the start of a quantum the executor takes one snapshot of the param
  table. A kernel receives the previous and the new value of each param and
  ramps between them. A param can also declare a one-pole filter.
- The snapshot is a bounded read. A read that fails keeps the value of the
  quantum before (section 11.4).
- For each synced param that changed, the executor records the applied
  `(revision, streamFrame)` and `clockGeneration` in the audio-applied seqlock
  table for the render thread (section 11.1, F46).
- An event has a stream time. The executor passes it to the kernel with its
  frame offset in the quantum. An event that arrives after its time applies at
  the next quantum start, and the stats count it.

### 10.4 Sources and sinks

| Source | Data |
|---|---|
| Buffer slot | Planar `float32` PCM of a generated or loaded audio asset, decoded and resampled to the session sample rate on the prepare thread (section 5.5, F45), immutable |
| Stream slot | A ring that a batch node fills, for chunked speech or music. An empty ring gives silence and a count |

| Sink | Path |
|---|---|
| Device | The output ring, which the device callback reads |
| Tap | A ring to the analysis thread, or a level computed in the plan |
| Capture | A ring to a job that encodes a file or returns chunks to the workflow |

A ring has one producer and one consumer (F13). The audio thread writes the
ring of each sink itself, so a recorder never shares the device ring (F36). A
full tap or capture ring loses that quantum for its consumer only. The stats
count it, and a capture job records the position of the gap.

The analysis thread computes spectra and onsets from a tap and writes them to
a signal history with stream times (F20).

### 10.5 Built-in kernels as WebAssembly

In the browser, the control executor, the audio executor and the built-in
kernels compile to one module with one linear memory (N2). The plan arena, the
port buffers, the state blocks and the param blocks lie in that memory. A
pointer of the kernel interface is a 32-bit offset there (F35).

A call from the executor to a kernel stays inside the module. No sample is
copied and no call crosses the module boundary inside a quantum. The worklet
copies the input and the output of each quantum between the module memory and
its own arrays, which the worklet interface requires in any case.

This code is reviewed and tested as the native build is. It runs on the
worklet thread without a deadline guard.

### 10.6 Kernels that arrive as data

A kernel from a creator or a pack comes in phase P7. It needs two contracts
first (F34, F35).

Memory contract:

- A module has no imports. It exports its memory, the kernel functions and one
  layout function. The loader rejects a module with any import, so a kernel
  can compute and nothing else.
- The memory has equal minimum and maximum sizes. The loader rejects a module
  that can grow its memory.
- The layout function returns the offset and the size of five regions: input,
  output, params, events and state. The loader checks that each region is
  aligned to 16 bytes, lies inside the memory and overlaps no other region.
- The host copies the input blocks in before a call and the output blocks out
  after it, 512 bytes for each channel at 128 frames. The host writes the
  input, param and event regions only. The kernel owns the rest.
- The state stays in the instance and follows the node while the instance
  lives. The host never reads it.

Execution contract:

- Epoch interruption is not a deadline guard (O8). A second thread must
  advance the epoch, the trap can arrive after the deadline, and a browser has
  no such call ([Wasmtime documentation][wt-interrupt]). An endless loop
  inside a worklet call stops the sound and cannot be ended.
- A kernel of this kind therefore runs in isolated mode, off the deadline
  thread. On the desktop that is a kernel worker thread with Wasmtime. In the
  browser it is a `Worker`. The audio thread exchanges blocks with it through
  two rings. The node has a declared latency of one quantum or more.
- When a block is not in the ring at its quantum, the node gives its bypass
  output: the input for an effect, silence for a source. The stats count the
  late block. A kernel that stays late is ended, by an epoch trap on the
  desktop and by `terminate()` in the browser. The error goes to the node.
- In the browser the rings need shared memory and thus cross-origin isolation.
  Without it the blocks travel as messages, and the latency is longer.
- A metered mode on the deadline thread stays an option (Q9). The loader would
  count instructions at each loop and call, with Wasmtime fuel on the desktop
  and a rewrite of the module in the browser. That bounds the instruction
  count of a call and not its time. Wasmtime documents fuel as slower than
  epochs, so this mode needs a measurement before a decision.

Wasmtime 29 has the calls for the desktop side:
`wasmtime_config_epoch_interruption_set`, `wasmtime_context_set_epoch_deadline`,
`wasmtime_config_consume_fuel_set` and `wasmtime_context_set_fuel`.

## 11. Control plane protocol

### 11.1 Params

The session owns a fixed param table. Each entry is a single-writer seqlock,
the `SeqLock` of [`AudioClockFeed.h`][tl-feed]. Writers are the host and the
runner worker, serialized by a mutex that no realtime thread takes. A reader
takes one snapshot for each tick. A continuous value cannot overflow a queue,
because the table keeps the latest value only.

The compiler gives each param a sync policy (D7g):

| Policy | Param | Sound | Picture |
|---|---|---|---|
| Immediate | Read by the render plan only | Not applicable | The next frame |
| Audio | Read by the audio plan only | The next quantum start | Not applicable |
| Synced | Read by both plans, or marked synced on its node | The next quantum start | The first frame whose audible time reaches that quantum |

For a synced param, the audio thread records `(revision, value, streamFrame,
clockGeneration)` in its audio-applied seqlock table at the quantum start
(F46). The render thread reads that entry with `tryLoad` each frame and applies
the value when its audible stream frame reaches `streamFrame` for the matching
`clockGeneration`, or immediately when `clockGeneration` changed or no audio
device runs.

A synced param makes the picture respond as late as the sound does, about
36 ms with the default lead (section 13). A node can mark a param immediate
when a fast response of the picture matters more than the match (R10).

### 11.2 Messages

| Message | From, to | Carrier | Applied | When full or late |
|---|---|---|---|---|
| Plan | Prepare to render, prepare to audio | Single-slot handoff | Next tick boundary, or its effective stream time | A newer plan replaces a plan that was not taken yet |
| Slot value | Prepare to both | Pointer exchange | Next tick boundary | The latest value wins |
| Param | Host or worker to both | Param table | By its sync policy | The latest value wins |
| Audio-applied state | Audio to render | Seqlock table | When its stream frame is audible, or immediately on generation change | The latest state for each slot and plan revision is always readable |
| Event | Host or worker to one consumer | Bounded queue | At its stream time | The newest event is dropped and counted |
| Retired object | Realtime threads to prepare | Bounded queue | When the prepare thread runs | Cannot be full (section 11.4) |
| Stats | Realtime threads to host | Seqlock | Read on request | Not applicable |
| Node error | Realtime threads to worker | Bounded queue | Sent as a `node_update` | Dropped and counted |

A revision that changes both plans has one effective stream time (D7g, F46).
The audio thread takes its plan at a quantum start and writes
`(planRevision, clockGeneration, streamFrame)` to the audio-applied seqlock.
The render thread takes any pending plan from its handoff slot into a tiny
local staging slot (up to two revisions) so a newer revision from the prepare
thread within the 36 ms ring lead does not overwrite an unapplied synced plan
in the handoff slot. It swaps to the staged plan when the audible frame reaches
`streamFrame` for the matching `clockGeneration`, or swaps immediately to the
newest staged plan if the audio thread has already advanced to a newer
revision, `clockGeneration` changed, or the audio device stopped. A revision
that changes one plan swaps at the next tick of that plan. While the session is
paused, each thread swaps when it next wakes.

### 11.3 Plan swap

1. The worker compiles the graph to IR.
2. The prepare thread builds the plan. It links a node to its existing state
   when the state key is equal. Each other node gets a new block, cleared and
   initialized.
3. The realtime thread takes the plan at a tick boundary and puts the old plan
   on the retire queue. From that tick it runs the new plan only.
4. The prepare thread destroys the old plan and each state block that no plan
   names.

One plan of a domain runs in each tick. State moves with the node, and two
running plans never share it. A player, an oscillator or a filter therefore
advances once for each quantum across a swap (F31).

The state key of an audio node has these parts: its graph node, its kernel id,
the `state_version` of the kernel, its structural params, the sample rate, the
quantum and the channel layout. A structural param changes the meaning of the
state: the maximum time of a delay, the order of a filter, the length of a
table. An equal byte layout is not enough. A delay line of one size holds
another span of time at another sample rate. A node whose key changed starts
from cleared state.

The state key of a stateful control operation has these parts: its graph node,
its operation id, its `stateVersion` (section 6.2), the sample rate and the
quantum (F47). When an edit adds or removes the audio plan and moves a stateful
control operation between the render thread and the audio thread, the dual-plan
swap rule (D7g) hands the state block over at the effective stream frame of the
swap so only one thread steps it in any quantum.

Continuity at an audio sink comes from a slope-extrapolated offset ramp gated
on `subgraphHash` (section 6.2, F48) and not from a second plan:

1. Each sink remembers the last two output samples per channel of the previous
   quantum (`old[N - 2]` and `old[N - 1]`).
2. When a swap leaves the sink's `subgraphHash` unchanged, no ramp runs and the
   output bytes are identical to a run without the swap (section 15).
3. When `subgraphHash` changed, the sink predicts the first sample of the new
   quantum from the prior slope (`pred = 2 * old[N - 1] - old[N - 2]`), takes
   `diff = pred - new[0]` for each channel, and adds `diff` with a linear decay
   to zero over 256 frames, 5.8 ms at 44.1 kHz.

The ramp removes the step at the swap without duplicating the last sample on a
continuous wave. It costs one addition for each sample for two quanta. It does
not smooth a change of timbre, which the creator asked for with the edit (R11).
A crossfade of two plans is rejected for this version (O7). A later version
that adds it needs three rules: a second state block for each node downstream
of the edit, one read of each source for both plans, and an admission test that
the measured cost of both paths fits in half a quantum.

The render plan follows the same rule. A retained output and a feedback pair
follow their graph node when the module, the output contract and the size are
equal. Each other pass starts dirty.

### 11.4 Bounds and reclamation

Every exchange with a realtime thread has a bound (F36, F49):

- A realtime thread reads a seqlock with `tryLoad` and a fixed attempt count.
  The timeline's callback uses 64 attempts. A failed read keeps the last
  coherent value and adds to a counter. The unbounded `load` stays for other
  threads. The extracted library gives realtime code a reader type that has
  `tryLoad` only.
- Each queue has a fixed capacity and the full behavior of section 11.2.
- Each domain has its own single-producer, single-consumer retire queue of
  capacity `maxSlots + 2`, written by its realtime thread and drained by the
  prepare thread.
- The prepare thread drains both retire queues before publishing a plan or a
  slot value. It writes a new plan or slot pointer with
  `pending.exchange(newPtr)`. If the returned previous `pending` pointer is
  non-null, the realtime thread never took it, and the prepare thread destroys
  it immediately without using a retire queue.
- When a realtime thread takes a non-null `pending` pointer with
  `pending.exchange(nullptr)`, it pushes the replaced active object onto its
  retire queue. Because a realtime thread retires at most one active plan and
  at most one active value per slot between prepare drains, and the prepare
  thread reclaims unconsumed `pending` pointers directly, the retire queue
  cannot overflow.
- A value that both plans read has a reference count of two, one for each
  domain's handoff slot. Each realtime thread retires its replaced active
  reference through its own retire queue, and the prepare thread drops the
  reference of any unconsumed `pending` pointer it overwrites. An inactive
  domain leaves its `pending` pointer in place, where the next update replaces
  and drops it on the prepare thread without blocking the active domain. A
  domain that stops returns its active references before the stop call returns.
- A ring has one consumer. Section 10.4 gives each sink a ring of its own.

### 11.5 JavaScript

JavaScript runs on the runner worker only. A script or a Code node is a batch
node, and its result is a latched value. A later ticked script can publish
values at a control rate through the param table. A late value leaves the
previous value in place, and no tick waits for the worker.

## 12. Native, WebAssembly, JavaScript or GPU

Rules:

- N1. Code on a deadline thread is compiled: native or WebAssembly. An
  interpreter never runs there (F28, F2).
- N2. Code that ships with the app is native on the desktop. The same source
  compiles to WebAssembly for the browser (F26, F27).
- N3. Code that arrives as data is WebAssembly on every host. It runs off the
  deadline threads, under the contracts of section 10.6.
- N4. Pixel work is WGSL on the GPU on every host.
- N5. JavaScript decides and does not compute a sample or a frame. It compiles
  plans, sets params, schedules events and reacts to results.
- N6. Kernel builds use no fast-math option and no fused multiply-add
  contraction. Both are needed for equal results on two hosts, and they are
  not enough (F30, F40). Section 15.1 gives the full conditions and the
  kernels that they cover.

| Component | Desktop | Browser | Reason |
|---|---|---|---|
| Plan compiler | TypeScript in the QuickJS guest | TypeScript | Runs once for each edit. One implementation |
| Session, clock, drivers | Native C++ | TypeScript and a worklet | Thread and device control |
| Control executor | Native C++ | The same source as WebAssembly | One definition of each operation |
| Render executor | Native C++ on wgpu-native | Open (Q8): the existing TypeScript `Executor`, or the C++ executor as WebAssembly | The GPU does the work. Section 14.5 compares the two |
| Shaders | WGSL | WGSL | N4 |
| Audio executor, built-in kernels | Native C++ | The same source as one WebAssembly module in an AudioWorklet | N2. Native code is 2 to 8 times faster where SIMD applies |
| User and pack kernels, phase P7 | WebAssembly in Wasmtime on a kernel worker thread | WebAssembly in a `Worker` | N3. Equal to native on recurrences, isolated from the deadline thread, one binary for both hosts |
| Analysis | Native C++ on the analysis thread | WebAssembly | N2 |
| Media decode | libav on decode workers | WebCodecs | Exists on both hosts |
| Models, network, scripts | The finite kernel | The existing runners | D1 |
| Export encode | libav job | Out of scope | Exists |

WebAssembly on the desktop is an optional feature of the build. A build without
Wasmtime runs every built-in kernel and rejects a plan with a user kernel.

## 13. Performance budgets

These are targets. P0 and P1 replace them with measured values.

Frame, 16.67 ms at 60 Hz:

| Stage | Budget |
|---|---|
| Messages, param snapshot, control plan | 0.4 ms |
| Command encode, 64 passes or fewer | 1.0 ms |
| GPU execution | 10 ms |
| Reserve for the compositor and the scheduler | 5 ms |

Audio quantum, 2.90 ms:

| Measure | Budget |
|---|---|
| Mean render time | 1.45 ms, a load of 50% |
| Underruns in a 10 minute run, for each load profile | 0 |
| Minimum ring fill in that run | One device period or more |
| Maximum render time, 99.9th percentile, count of quanta over 2.90 ms, longest run of such quanta | Reported, no budget |

A 10 minute run has about 206,700 quanta at 44.1 kHz. A 99th percentile leaves
about 2,070 of them without a limit, so the criteria are worst values (F41).
Under the buffered driver one late quantum is not audible while the ring
holds. The audible failure is an empty ring, and the minimum ring fill shows
the distance to it.

The load profiles are:

| Profile | Condition |
|---|---|
| Idle | No other work |
| Busy | All cores run a compile |
| Stall | The runner worker sleeps for 500 ms each 5 s |
| GPU | A batch GPU workload runs on the shared device |
| Swap | One plan swap each second |

The next table is arithmetic from section 3.4 on the measured machine. It is
not a supported graph size. A graph adds the call and the param ramps of each
node, memory traffic and the load of other threads.

| Engine | One stereo biquad for one quantum | Stereo biquads at 50% load |
|---|---|---|
| Native or WebAssembly | 0.63 µs | About 2,300 |
| QuickJS | 10.3 µs | About 140 |

Latency:

| Path | Target |
|---|---|
| Immediate param to picture | 2 frames |
| Param change to sound | Ring lead, device latency and one quantum. About 36 ms with the default lead and a device latency of 10 ms |
| Synced param to picture | The time of the sound, or 2 frames when that is longer |
| Analysis value to picture | Within one refresh period (D7h). P0 measures it |
| Edit to active plan, no new shader | 100 ms |

Memory: a 1920×1080 target takes 7.9 MiB as `rgba8unorm` and 15.8 MiB as
`rgba16float`. Sixteen pooled float targets take 253 MiB, inside the 512 MiB
budget.

## 14. Host integration

### 14.1 Runner API

`GraphRunner` gets one new call that opens a session. This sketch is not
final:

```cpp
struct LiveOptions {
  PresentTarget target;         // surface, host target, or empty: a texture
  int sampleRate = 44100;       // 44100 or 48000
  AudioBackend audio = AudioBackend::Null;
  FrameRate frameRate;          // display, or a fixed rate
  int width = 1920, height = 1080;
};

// Owned by the host via std::unique_ptr<LiveSession>.
// GraphRunner must outlive LiveSession (section 7, F50).
class LiveSession {
public:
  ~LiveSession();

  // Host GUI thread:
  void update(std::string graphJson);                 // compile and swap
  void setParam(std::string nodeId, std::string field, std::string valueJson);
  void play(); void pause(); void reset();
  void resizeSurface(int width, int height);
  void detachSurface();

  // Host render thread (host target only):
  void renderFrame(HostFrame frame);

  // Any thread:
  LiveStats stats() const;
};
```

`HostFrame` holds the texture view of one frame and its predicted presentation
time. A host with a host target calls `renderFrame` on its own render thread,
once for each of its frames (D14).

A session sends `ProcessingMessage` objects through the same handler as a job:
a `job_update` with the status `running`, a `node_update` for each node error,
and a stats message at 4 Hz or less.

### 14.2 Node editor

The editor shows the picture in a `QWindow` inside
`QWidget::createWindowContainer` and passes its native handle to the session.
Play, pause and reset sit beside the picture. A graph with a live output opens
a session when the creator runs it, and the status text names the nodes that
run live. The container window is the first presenter, and the executor does
not depend on it (D14).

### 14.3 Command line

`nodetool-graph-runner live` renders a graph offline for a duration and writes
frames and a WAV file. `--null-audio` and the software adapter make it run in
CI. A `live bench` mode reports the frame and quantum statistics of section 13.

### 14.4 Project layout

| Project | Content | Depends on |
|---|---|---|
| `native/audio-io` (extracted) | The miniaudio device wrapper, the null backend, `AudioClockFeed`, `OutputLatency`, `PcmRing` | Standard library, miniaudio |
| `native/realtime` (new) | IR loader, control executor, render executor, audio executor, kernels, drivers, session | `audio-io`, `webgpu.h`, optional Wasmtime |
| `native/graph-runner` | The session API, slot-write node, compiler call | `realtime` |
| `native/timeline` | Uses `audio-io` in place of its own device code | `audio-io` |

### 14.5 Browser

Audio runs in an AudioWorklet that loads the control executor, the audio
executor and the built-in kernels as one WebAssembly module (section 10.5).
Shared memory between the page and the worklet needs cross-origin isolation.
Without it, params travel as messages and arrive one or more quanta later.

The render executor has two candidates (Q8):

| Candidate | Gain | Cost |
|---|---|---|
| The existing TypeScript `Executor`, driven from the IR | It exists and runs the catalog in browsers today | A second implementation of the dirty, retention, swap and sync rules, with a parity test for each |
| The C++ render executor as WebAssembly, on Emscripten's `webgpu.h` binding | One implementation of those rules for both hosts | A second header revision beside the pinned wgpu-native header, a call through JavaScript for each WebGPU call, a larger download |

The choice is tested and not assumed (F43). At the end of P1 the C++ executor
is built for `wasm32` and runs two fixtures in a browser. Three numbers decide:
the count of lines that differ between the two header revisions, the frame
cost of a plan with 64 passes, and the size of the module.

## 15. Offline rendering and tests

Offline mode uses the exact clock (D7b). For each video frame it renders the
quanta that end before the next frame time, then the frame. Readbacks use the
staging ring of section 9.5.

| Test | Evidence |
|---|---|
| IR snapshots | A fixture graph compiles to the stored IR |
| Repeat | Two offline runs of each fixture give the same bytes (level 1) |
| Audio parity | Each qualified kernel gives the same bytes in its native and its WebAssembly build (level 3). Each other kernel meets level 2 |
| Frame goldens | Offline frames on the software adapter match stored frames within a tolerance |
| Realtime rules | The allocation counter of F13 reads zero on the audio render thread across a run. ThreadSanitizer covers plan swaps under load. A seqlock held in its writing state by `holdWriteForTest` does not block a realtime read |
| Stall | The worker sleeps for 500 ms during a session with the null device. The run meets the audio criteria of section 13 and has no missed frame |
| Swap state | An edit that leaves the audio path unchanged gives the same output bytes as a run without the edit. An edit on the path leaves no step above the ramp at the sink |
| Synced change | Offline, a synced param change appears in the frame whose time matches the quantum of the change |
| Stateful control | A damper gives the same values at equal stream times in a 60 Hz session, a 120 Hz session and offline mode |
| Retention | A clean retained pass does not run for 100 frames and keeps its pixels while volatile passes use the frame pool. A resize presents a new frame without a graph change |
| Check proof | Each new check fails on a deliberately invalid input, as the [harness rules][harness] require |

The CLI commands of section 14.3 are the harness. They get an entry in the
harness registry and a budget file, as the timeline keeps under
`native/timeline/budgets/`.

### 15.1 Levels of agreement

Three levels replace one claim of equal results (F40):

| Level | Claim | Covers | Evidence |
|---|---|---|---|
| 1. Repeatable | One build, one plan and one session log give the same bytes on each offline run | Every kernel. Frames on one adapter | Two runs compare equal |
| 2. Tolerance | Two hosts agree within a stated limit | Every kernel, with a peak difference of -90 dBFS or less as a first limit. Frames, with the limit of the frame goldens | Fixtures on both hosts |
| 3. Bit-identical | The native build and the WebAssembly build give the same bytes | The kernels on a qualified list | A byte compare for each fixture |

A kernel qualifies for level 3 when all of these hold:

- It uses addition, subtraction, multiplication, division, square root and
  comparison only. IEEE 754 defines one result for each. A conversion from
  float to integer checks its range first, because C and WebAssembly differ
  outside that range.
- It calls no platform math library. Sine, exponential, power and hyperbolic
  tangent come from one source file of the project, built for both targets.
- Its build has no fast-math option and no contraction (N6). The compiler can
  then vectorize an operation lane by lane and cannot reorder a sum.
- It uses no relaxed SIMD instruction. That proposal gives up determinism
  between architectures ([Wasmtime documentation][wt-determinism]).
- Its result does not depend on a flush-to-zero mode. WebAssembly has no such
  mode, so the native audio threads do not set one. A kernel that can decay
  into subnormal values clears small state values in its source (R13).
- Its fixtures give finite output. WebAssembly does not define the bit
  pattern of a NaN, and section 17 replaces non-finite samples at each sink.

Level 1 needs fixed inputs:

- A random source takes its seed from the session seed and its graph node. No
  kernel reads a clock or an address.
- The host clears each state block before `init`.
- Events and param changes apply in the order of their stream frame and then
  their revision.
- A live session can write a session log: each param change, each event and
  each slot value by reference, with its effective stream frame. An export
  that replays the log repeats the session. An export without a log is a new
  performance.

The benchmark of section 3.4 shows level 3 for one biquad chain and one mix on
one input, and nothing more.

## 16. Delivery plan

| Phase | Work | Exit evidence |
|---|---|---|
| P0 | A spike outside the product on macOS. One shader chain on a wgpu surface in a Qt container window. One audio chain on the buffered driver. A synced param and one plan swap each second, with state that follows the node. A batch GPU workload on the shared device. One built-in kernel as WebAssembly in an AudioWorklet. A deliberate worker stall | Recorded frame interval statistics. The audio measures of section 13 for each load profile. The offset between sound and picture for a synced change, from a camera and a microphone. Frame misses with the gate, without it and with a second device. Pipeline creation times. Equal bytes from the native and the browser kernel |
| P1 | `native/realtime` core, headless: IR loader, control executor, render executor, audio executor, first kernels, offline driver, CLI. A `wasm32` build of the render executor | Section 15 tests pass, except stall, swap state and audio parity. Q8 is decided |
| P2 | `audio-io` extraction, buffered driver, surface presenter, submit gate, clocks, params with sync policies | Stall test passes. `live bench` meets section 13 on the reference machine |
| P3 | Compiler, live descriptors for the catalog nodes and the audio nodes, slots, slot-write node, editor picture and transport | The example of section 1 runs in the editor. The swap state test passes |
| P4 | Custom shader node, analysis taps, feedback nodes | A tap fixture and a feedback fixture pass the frame goldens |
| P5 | Browser executors | Audio parity passes in the browser. The P1 frame fixtures meet level 2 there |
| P6 | Encoded export, capture sinks, taps into batch regions, session log | An export of a fixture plays in sync. An export from a session log repeats the session |
| P7 | Kernels that arrive as data, in isolated mode | The loader tests of the memory contract pass. A kernel with an endless loop gives late blocks and no underrun, on the desktop and in a browser |

P0 decides R1 and R2 before P1 starts. It also replaces the targets of D7h and
section 13 with measured values. The built-in kernels and the WGSL path
deliver phases P1 to P6 without the kernel contracts of section 10.6.

## 17. Failure handling

| Failure | Detection | Behavior |
|---|---|---|
| A block of a user kernel is late | Its ring is empty at the quantum | The node gives its bypass output and counts the block. A kernel that stays late is ended, and the error goes to the node |
| An analysis value is late or stale | The read of D7h | The frame uses the entry before, and the stats count it |
| A realtime read meets a writer in progress | `tryLoad` fails | The thread keeps the last coherent value and counts the miss |
| A tap or capture ring is full | The write fails | That consumer loses the quantum. The stats count it, and a capture records the gap |
| The texture budget is exceeded | The account at a frame boundary | Retained outputs are evicted, the least recently read first |
| Non-finite samples | A scan at each sink | The sink writes silence for that quantum and counts it |
| Audio underrun | The ring is empty in the callback | Silence, a count, and one step more ring lead up to a limit |
| Missed frame | The frame interval | A count, and a lower render scale in adaptive mode |
| Shader or plan error | The prepare step | The plan is rejected, the previous plan continues |
| GPU device lost | The wgpu callback | The picture stops with a reason. The sound continues. The host can open a new session |
| Audio device change | The miniaudio notification | The ring is flushed and the clock gets a new anchor |
| Surface resize or loss | The acquire status | The surface is configured again at the frame boundary |
| Worker stall | None needed | Plans keep running. Edits and slot values wait |

## 18. Risks

- R1. A wgpu surface inside a Qt container window is not proven on the three
  platforms. P0 covers macOS. An occluded surface under `Fifo` can block on
  Wayland, so the acquire needs a timeout there.
- R2. A local model on the same GPU delays frames. The application has no
  portable deadline or preemption guarantee on a GPU queue, and the gate of
  section 9.2 covers the session's device only. The session reports the
  misses. Mitigations are a remote provider, a second GPU or a lower frame
  rate.
- R3. Calls into Wasmtime on a realtime thread may allocate or use trap
  handlers that need per-thread setup. Isolated mode keeps Wasmtime off the
  deadline threads, so this risk applies to the metered mode of Q9 only.
- R4. The product then has two GPU stacks: QRhi in the timeline and wgpu here.
  A live source in the timeline needs a texture exchange or a readback.
- R5. Hardware-decoded video frames enter wgpu through a CPU upload, about
  3 MB for a 1080p NV12 frame. Several 4K streams need an import path that
  `webgpu.h` does not have.
- R6. The browser build needs a C++ toolchain for `wasm32` in CI.
- R7. A custom WGSL shader with a long loop can stall the GPU. No call
  interrupts a shader, so the device-lost path is the only defense.
- R8. The operator set can grow without limit. Each addition needs a creator
  request and a fixture.
- R9. The realtime thread class can need an entitlement or a system service
  that a packaged app lacks.
- R10. A synced change makes the picture respond as late as the sound. With a
  long ring lead a control can feel slow. The immediate policy for that param
  is the mitigation.
- R11. The offset ramp removes the step at a swap and can leave a short low
  thump after a large change. P0 records it. A crossfade (O7) is the fallback.
- R12. Fixed control steps in a session without audio need a catch-up after a
  stall. Section 5.4 limits it to 0.25 s, and the values after a longer stall
  differ from an offline run.
- R13. Level 3 forbids a flush-to-zero mode on the native audio threads. A
  kernel that does not clear subnormal state runs slowly on x86. A test feeds
  each kernel silence after a signal and checks its render time.

## 19. Open questions

- Q1. Does a run of a graph with a live output always open a session, or does
  the creator choose between a session and a finite render?
- Q2. Are the live outputs new node types, or do the existing
  `nodetool.audio.realtime.AudioOutput` and the `Output` node take that role
  inside a session?
- Q3. Which session rate is the default when the device runs at 48 kHz:
  44.1 kHz with a conversion at the device, or 48 kHz?
- Q4. Is the picture size a session setting or the size of the window?
- Q5. Should existing image nodes get live descriptors, or should live work
  use the generated catalog nodes only?
- Q6. Which tap policy does a live-to-batch loop need first: on request or
  when idle?
- Q7. Does the browser render loop run on the main thread or on a worker with
  an `OffscreenCanvas`?
- Q8. Is the browser render executor the TypeScript `Executor` or the C++
  executor as WebAssembly? Section 14.5 gives the test and the three numbers.
- Q9. Do user kernels need a metered mode on the deadline thread, or is
  isolated mode with its latency enough?
- Q10. Does the sync policy of a param need a control in the editor, or is the
  compiler's default enough?

## 20. Related documents

- [Graph runner README][gr-readme]
- [Asynchronous host operations][async-host]: jobs, lanes and mailboxes
- [Graph runner execution][gr-exec]
- [Native timeline design][tl-design]: clock, audio and preview decisions
- [Native rules][native-rules]: ownership and thread rules for this code
- [Reactive sessions][rs-plan] and [shared variables][sv-plan]: the finite
  side of an interactive session
- [Color precision plan][color-plan]: the SDR working contract of the shader
  catalog
- [Harness-first rules][harness]

## Appendix A. Benchmark method

The source and the commands are in the [kernel benchmark][kernel-bench]
folder. P1 replaces it with `live bench`.

- Biquad: eight cascaded low-pass sections (1 kHz, Q 0.7071) in transposed
  direct form II, in place on 512 interleaved stereo frames of noise. A block
  is 8,192 filter steps. The input is copied in again before each block.
- Mix: `dst[i] = a[i] * 0.7 + b[i] * 0.3` over 1,024 samples, 16 calls for
  each block.
- Each engine ran 20,000 measured blocks after 2,000 warm-up blocks. QuickJS
  ran 2,000 after 200. Each configuration ran twice, and the table gives the
  range of the two means.
- The C and WebAssembly versions use `float`. The JavaScript version uses
  `Float32Array` storage and double arithmetic.
- The WebAssembly module was written as text and assembled by Wasmtime. The
  same binary ran in Wasmtime through its C API and in Node.
- QuickJS-ng was built from the source that the graph runner pins.
- The worst biquad block at normal priority took at most 0.11 ms in native
  code and 0.44 to 0.66 ms in QuickJS. An earlier QuickJS run had one block of
  8.8 ms that two later runs did not repeat.
- The timed region of each biquad row includes one copy of the input block,
  4 KiB.
- A later run of the checked-in script on the same machine gave biquad times
  about 10% lower in the compiled engines and 5% lower in QuickJS, with the
  same checksums. The ratios between the engines stayed within 6%.
- Equal checksums show agreement for these two kernels on this input only
  (F40).

[tixl]: https://github.com/tixl3d/tixl/tree/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c
[tx-dirty]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/Operator/Slots/DirtyFlag.cs
[tx-slot]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/Operator/Slots/Slot.cs
[tx-sgn]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/DataTypes/ShaderGraphNode.cs
[tx-agn]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/DataTypes/AudioGraphNode.cs
[tx-ctx]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/Operator/EvaluationContext.cs
[tx-audio]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/Core/Audio/AUDIO_ARCHITECTURE.md
[tx-timing]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/.agentic/Plans/Plan_FrameTiming.md
[tx-facade]: https://github.com/tixl3d/tixl/blob/5bc0c542584c5e845b5aa1186a98c2b471a8aa0c/.agentic/Plans/Plan_GraphicsFacade.md
[gr-readme]: ../../native/graph-runner/README.md
[gr-h]: ../../native/graph-runner/include/nodetool/graph_runner.h
[gr-cpp]: ../../native/graph-runner/src/graph_runner.cpp
[gr-runner]: ../../native/graph-runner/src/kernel/runner.cpp
[gr-gpu]: ../../native/graph-runner/src/host/gpu_device.h
[gr-gpu-cpp]: ../../native/graph-runner/src/host/gpu_device.cpp
[gr-gpu-host]: ../../native/graph-runner/src/host/gpu.cpp
[gpu-ctx]: ../../packages/gpu/src/context.ts
[gpu-types]: ../../packages/gpu/src/types.ts
[color-plan]: color-precision/high-precision-media-processing.md
[kernel-bench]: graph-runner-realtime-bench/README.md
[wt-interrupt]: https://docs.wasmtime.dev/examples-interrupting-wasm.html
[wt-determinism]: https://docs.wasmtime.dev/examples-deterministic-wasm-execution.html
[webaudio-11]: https://www.w3.org/TR/webaudio-1.1/
[img-filter]: ../../packages/image-nodes/src/nodes/lib-image-filter.ts
[rt-audio]: ../../packages/audio-nodes/src/nodes/realtime-audio.ts
[ne-readme]: ../../native/node-editor/README.md
[tl-engine]: ../../native/timeline/src/audio/AudioEngine.h
[tl-feed]: ../../native/timeline/src/playback/AudioClockFeed.h
[tl-design]: ../../native/timeline/docs/DESIGN.md
[native-rules]: ../../native/AGENTS.md
[async-host]: graph-runner-async-host.md
[gr-exec]: graph-runner-execution.md
[qjs-review]: graph-runner-quickjs-review.md
[rs-plan]: reactive-sessions-events.md
[sv-plan]: shared-variables-input-bindings.md
[harness]: ../HARNESS_FIRST.md
