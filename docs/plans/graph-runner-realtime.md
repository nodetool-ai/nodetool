# Realtime graphics and audio in the native graph runner

Status: draft, revision 1. Nothing in this document is implemented. Sections 4
to 17 specify proposed behavior.

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
| G2 | A graph section produces a continuous stereo stream at 44.1 kHz. The audio threads make no lock, allocation, log or I/O call. |
| G3 | Picture and sound share one clock. A value derived from the sound reaches the picture in the frame where that sound is audible. |
| G4 | Slow nodes stay asynchronous. A result enters a realtime section at a tick boundary and never delays a tick. |
| G5 | An edit replaces the running plan without a gap in sound or picture. The state of unchanged nodes survives. |
| G6 | The same plan renders offline with exact time, for export and for tests, and gives the same result on each run. |
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
- D6. Built-in kernels are native code. Kernels that arrive as data are
  WebAssembly. Pixel work is WGSL. JavaScript sets values and never computes a
  sample or a frame (section 12).
- D7. The audio stream is the master clock. The picture follows a visual clock
  locked to it. Values cross between the two domains by stream time.
- D8. The render plan tracks versions, so an unchanged pass does not run (F16).
- D9. A new plan replaces the old plan at a tick boundary. Node state follows
  the node's identity. Old plans are destroyed off the realtime threads.
- D10. Slots carry the results of slow nodes into the plans.
- D11. Offline mode drives the same executors with exact time (F21).
- D12. All time-dependent behavior uses seconds or beats. No kernel, control
  operation or shader uses a per-frame constant (F23).
- D13. The engine is a new project, `native/realtime`, with no Qt and no
  QuickJS dependency. The audio device and clock layer moves from the timeline
  into a shared library.

Rejected alternatives:

| Option | Reason for rejection |
|---|---|
| O1. Run the finite kernel once for each frame | Each run pays for lineage, correlation, JSON and messages (F2, F3), and no step has a bound. |
| O2. Give the guest WebGPU and WebAudio APIs and keep all logic in JavaScript | F28, and one stalled script would stop sound and picture together. |
| O3. Render on QRhi inside a Qt Quick item | Section 9.1. |
| O4. Compile every audio kernel to WebAssembly on the desktop too | F27. It also makes Wasmtime a required dependency on every platform. |
| O5. Use miniaudio's node graph as the audio executor, as TiXL does | The plan must be data that two hosts execute the same way, with a fixed quantum for exact offline results (G6, G7). |
| O6. Load native plug-ins for user kernels | A fault ends the host process. The VST host already runs as a child process for that reason. |

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
| Audio | Planar float32, 128 frames | Each quantum, 344.5 times a second at 44.1 kHz | Audio render |
| Texture | A GPU texture | Each frame | Render |
| Control | Scalar, vector, color or boolean | Once for each tick of its consumer | Render or audio render |
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

Control operations are pure functions of their inputs and the time: constants,
time sources, arithmetic, comparison, remap, oscillators, value noise,
envelopes, damping and vector packing. Stateful operations such as damping are
written against the time step (D12).

The compiler places a control operation in the domain of its consumer. An
operation with consumers in both domains is placed in both, because a pure
function of time gives the same value in each. A value that exists in one
domain only crosses as follows:

- Audio to render: the audio thread writes `(streamTime, value)` pairs to a
  signal history, once for each quantum. The render thread reads the value for
  the audible time of its frame.
- Render or host to audio: the value goes through the param table
  (section 11.1) and is smoothed.

The executor is a register machine: a flat list of operations with register
indexes, without allocation. The same C++ source serves both domains.

### 5.5 Session and the finite kernel

A session does not replace a job. The compiler rewrites each batch region so
that its boundary outputs end in an internal slot-write node, implemented in
C++ as `output_node.cpp` is. The kernel runs that region as an ordinary job. When
a creator edits an input of a batch node, the host runs the affected subgraph
again, and the new result replaces the slot value. The session keeps running
through each of these runs.

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
  "session": { "sampleRate": 44100, "quantum": 128, "width": 1920, "height": 1080 },
  "params": [{ "slot": 0, "node": "a1", "field": "cutoff", "smooth": "ramp" }],
  "slots": [{ "id": "t0", "kind": "texture", "source": "n2.output" }],
  "control": { "registers": 24, "ops": [["time.beats", 0], ["osc.sine", 1, 0]] },
  "render": {
    "passes": [{ "node": "n4", "module": "filters/blur@1", "inputs": { "src": "t0" },
                 "uniforms": [1], "animated": true }],
    "present": "n4"
  },
  "audio": {
    "nodes": [{ "node": "a1", "kernel": "biquad.lowpass", "in": [0], "out": [1], "params": [0] }],
    "sinks": [{ "buffer": 1, "kind": "device" }]
  }
}
```

Rules:

- A pass, an audio node and a param each name the graph node they come from.
  That name is the identity for state and for error reports (D9).
- Param slot numbers stay the same across revisions for an unchanged node and
  field.
- The compiler orders passes and audio nodes topologically and assigns audio
  buffers by liveness, so the executors do no graph work.
- The compiler reports each node that stopped the walk and why. The editor can
  show which nodes run live.

### 6.3 Validation

The compiler rejects a plan with a cycle that has no delay, a kind mismatch on
an edge, or an unknown module or kernel. The prepare step rejects a plan whose
shader fails to compile or whose resources exceed the session budget. A
rejected plan never becomes active, and the previous plan keeps running.

## 7. Threads and ownership

| Thread | Owns | Never does |
|---|---|---|
| Runner worker (exists) | The JavaScript engine, the kernel loop, the compiler call, batch runs | Touch a plan after it is handed over |
| Prepare (new, one for each session) | Plan construction: pipelines, textures, kernel state, WebAssembly instances. Destruction of retired plans and slot values | Run inside a frame or a quantum |
| Render (new) | The active render plan, the surface, frame resources, the visual clock, the control registers of its domain | Wait for the worker, compile a shader, allocate in steady state |
| Audio render (new) | The active audio plan, the control registers of its domain, the write side of the output ring | Lock, allocate, log, do file or network I/O |
| Device callback (miniaudio) | The read side of the ring, the clock pair | Anything except a copy and the clock write |
| Analysis (new, optional) | FFT state, the read side of a tap ring, the write side of a signal history | Run on the callback |
| Host GUI | The window and the transport controls | GPU or audio calls |

Ownership, as [native rule 16][native-rules] requires:

- `LiveSession` is held by the host in a `std::unique_ptr`. Its destructor
  stops the device, joins the audio render, render and prepare threads in that
  order, and then destroys the plans.
- A plan is immutable after construction and is held in a `std::unique_ptr`.
  It moves from the prepare thread to its realtime thread through a
  single-slot handoff, and back through a retire queue. Only the prepare
  thread destroys it.
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
  1. Each frame, advance by `k` refresh periods, where `k` is the count of
     periods since the last frame.
  2. Compute the error against the audio position predicted for the
     presentation time.
  3. Remove a small part of the error each frame. That absorbs the drift
     between the audio device and the display.
  4. When the error exceeds half a period, correct it in one step and count
     the correction.
- D7d. The refresh period is measured and never assumed. The first estimate
  comes from the display mode.
- D7e. The presentation time of a frame is the present call plus a display
  latency. The default is one refresh period, and the host can set an offset
  in seconds for each output device.
- D7f. The tick context gives each operation `seconds`, `beats`, `dt`, `frame`
  and the output size. An operation that integrates uses `dt`.

Reactive visuals stay in sync under any buffer size. The audio for a stream
time is produced before it is audible, by the ring lead plus the device
latency. Its analysis value is in the signal history when the render thread
asks for that time. Buffering thus delays the response to a control change and
not the match between sound and picture.

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

### 9.2 Device and surface

- The session uses the process-wide device of the GPU host, so a texture from a
  batch node can become a slot value without a copy. It receives the device
  through a typed context object, not through the `compute` callback that
  carries a native-rules marker ([`gpu_device.h`][gr-gpu]).
- The frame path does not take the GPU host's device lock. It encodes its own
  commands and relies on the thread safety of wgpu.
- The host passes a surface description: a Metal layer, a window handle, or an
  X11 or Wayland surface. The pinned header has these sources and the calls
  `wgpuSurfaceConfigure`, `wgpuSurfaceGetCurrentTexture` and
  `wgpuSurfacePresent`.
- The session checks that the device's adapter can present to the surface. If
  it cannot, the open call fails with that reason.
- The first surface paces the loop with `Fifo`. A later surface uses `Mailbox`
  and never blocks (F23).
- A session without a surface renders to a texture. Offline mode and tests use
  that.

### 9.3 Frame order

1. Acquire the surface texture. Under `Fifo` this call paces the loop.
2. Read the clocks and build the tick context.
3. Apply a pending plan, slot values and the param snapshot.
4. Run the control plan.
5. Encode each dirty pass, write the uniform block once, and submit one
   command buffer.
6. Present.
7. Publish the frame stats and move replaced resources to the retire queue.

The time is read after the acquire, so it is as close to the presentation as
the loop allows. TiXL evaluated its outputs before its clock update and showed
the previous frame's time (F22).

### 9.4 Dirty tracking

Each pass has a version. A pass runs when the version of an input changed, when
a uniform expression gave a new value, when a slot got a new value, or when
the pass is animated. A pass is animated when it or an upstream pass reads the
time. Other passes keep their output texture from the last run.

When no pass is dirty, the thread skips the frame and presents nothing. The
window keeps its picture, as the timeline holds its last frame. A paused
session then uses no GPU time.

### 9.5 Resources

- The prepare thread creates every pipeline before a plan becomes active. A
  shader compile never runs on the render thread.
- A static pass owns its output texture. Animated passes share a pool, and the
  compiler assigns pool entries by liveness.
- A feedback pair is two textures that swap each frame.
- One uniform buffer holds all blocks of a frame.
- Bind groups are cached for each pass and input set.
- The session has a texture budget, 512 MiB by default as the timeline's
  surface pool has. It is separate from the 64 MiB limit of batch textures. A
  texture that moves from a batch run into a slot leaves the run's account and
  enters the session's account.
- Targets are `rgba8unorm` by default. A pass can request `rgba16float`, which
  feedback chains need to avoid banding.
- WebGPU orders queued commands, so the reuse of a target in the next frame
  needs no fence. Readbacks are the exception: export and taps use a ring of
  three staging buffers and map them without a blocking poll.

### 9.6 Custom shaders

A custom shader node takes WGSL for one fragment function. The compiler adds
the standard inputs: time, resolution and the bound textures. The prepare
thread compiles the module inside a wgpu error scope. An error goes to the
node, and the previous plan keeps running.

### 9.7 Load control

- Timestamp queries give the GPU time of each pass when the adapter has the
  feature. The editor can show the cost of each node.
- A frame that misses its refresh advances the visual clock by two periods.
  The motion keeps its speed, and the stats count the miss.
- In adaptive quality mode, the session lowers the render scale from 1 to 0.75
  to 0.5 when misses persist, and raises it again after a period with
  headroom. The scale steps match the timeline's preview quality.

## 10. Audio plan

### 10.1 Quantum and kernels

The plan runs in quanta of 128 frames, 2.9 ms at 44.1 kHz. The Web Audio
render quantum has the same length, so a browser executor processes one plan
quantum for each worklet call (G7). A fixed quantum also makes an offline
render independent of the device buffer size (G6).

A kernel is a C interface. This sketch is not final:

```c
typedef struct nt_dsp_args {
  const float* const* in;      /* [port * channels], 128 frames each */
  float* const* out;
  const float* param_begin;    /* value at the first frame */
  const float* param_end;      /* value at the last frame */
  const nt_dsp_event* events;  /* sorted by frame offset */
  uint32_t event_count;
  uint64_t stream_frame;       /* position of frame 0 */
} nt_dsp_args;

typedef struct nt_dsp_kernel {
  uint32_t abi;
  uint32_t (*state_size)(const nt_dsp_config*);
  void (*init)(void* state, const nt_dsp_config*);
  void (*process)(void* state, const nt_dsp_args*);  /* realtime rules */
} nt_dsp_kernel;
```

The host allocates the state as one flat block. A kernel therefore never
allocates, its state can follow the node across plans (D9), and the same
contract maps onto WebAssembly linear memory.

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

- The engine owns the thread, so per-thread setup of the WebAssembly runtime
  happens at thread start and not inside a device callback.
- One late quantum does not cause an underrun.
- The same ring can feed a recorder or a stream encoder.
- Buffering does not harm sync, because values cross by stream time
  (section 8).

Parameters:

- The ring lead defaults to two device periods and at least 8 quanta, about
  23 ms.
- The thread requests the platform's realtime class: a time-constraint policy
  and the device workgroup on macOS, MMCSS on Windows, `SCHED_FIFO` on Linux. A
  refused request appears in the stats, and the session continues.
- The session opens the device at the session rate, 44.1 kHz by default.
  miniaudio converts when the hardware runs at another rate.
- All kernels obey the callback rules from the start, so the direct driver
  stays possible.

### 10.3 Params and events

- At the start of a quantum the executor takes one snapshot of the param
  table. A kernel receives the previous and the new value of each param and
  ramps between them. A param can also declare a one-pole filter.
- An event has a stream time. The executor passes it to the kernel with its
  frame offset in the quantum. An event that arrives after its time applies at
  the next quantum start, and the stats count it.

### 10.4 Sources and sinks

| Source | Data |
|---|---|
| Buffer slot | Decoded PCM of a generated or loaded audio file, immutable |
| Stream slot | A ring that a batch node fills, for chunked speech or music. An empty ring gives silence and a count |

| Sink | Path |
|---|---|
| Device | The output ring |
| Tap | A ring to the analysis thread, or a level computed in the plan |
| Capture | A ring to a job that encodes a file or returns chunks to the workflow |

The analysis thread computes spectra and onsets from a tap and writes them to
a signal history with stream times (F20).

### 10.5 WebAssembly kernels

- A module exports the kernel functions and has no imports. The loader rejects
  a module with any import, so a kernel can compute and nothing else.
- Its memory has a fixed size. Growth is disabled through the store limiter.
- The prepare thread compiles and instantiates the module. A compiled module
  can be cached by its hash.
- The port buffers and the state live in the instance memory, so a call copies
  no samples.
- Epoch interruption sets a deadline for each call. A kernel that passes it
  traps. The executor then bypasses the node and reports the error on it.
- Wasmtime 29 has the needed calls: `wasmtime_config_epoch_interruption_set`,
  `wasmtime_context_set_epoch_deadline` and `wasmtime_func_call_unchecked`.

P0 must show that a call into a prepared instance makes no allocation and no
blocking system call on the audio render thread (R3).

## 11. Control plane protocol

### 11.1 Param table

The session owns a fixed table. Each entry is a single-writer seqlock, the
`SeqLock` of [`AudioClockFeed.h`][tl-feed]. Writers are the host and the
runner worker, serialized by a mutex that no realtime thread takes. A reader
takes one snapshot for each tick. A continuous value cannot overflow a queue,
because the table keeps the latest value only.

### 11.2 Messages

| Message | From, to | Carrier | Applied | When full or late |
|---|---|---|---|---|
| Plan | Prepare to render, prepare to audio | Single-slot handoff | Next tick boundary | A newer plan replaces a plan that was not taken yet |
| Slot value | Prepare to both | Pointer exchange | Next tick boundary | The latest value wins |
| Param | Host or worker to both | Param table | Next tick | The latest value wins |
| Event | Host or worker to one consumer | Bounded queue | At its stream time | The newest event is dropped and counted |
| Stats | Realtime threads to host | Seqlock | Read on request | Not applicable |
| Node error | Realtime threads to worker | Bounded queue | Sent as a `node_update` | Dropped and counted |

The render plan and the audio plan swap separately. One edit can reach the
sound up to one frame before or after it reaches the picture.

### 11.3 Plan swap

1. The worker compiles the graph to IR.
2. The prepare thread builds the plan. It links each node to its existing
   state when the kernel or module and the state layout are the same.
3. The realtime thread takes the plan at its next tick boundary and puts the
   old plan on the retire queue.
4. When the path to an audio sink changed, the audio thread renders one
   quantum from both plans and crossfades them.
5. The prepare thread destroys the old plan and state that no plan names.

### 11.4 JavaScript

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
- N3. Code that arrives as data is WebAssembly on every host, under the limits
  of section 10.5.
- N4. Pixel work is WGSL on the GPU on every host.
- N5. JavaScript decides and does not compute a sample or a frame. It compiles
  plans, sets params, schedules events and reacts to results.
- N6. Kernel builds use no fast-math option and no fused multiply-add
  contraction. Native and WebAssembly outputs are then bit-identical, and a
  test compares them (F30).

| Component | Desktop | Browser | Reason |
|---|---|---|---|
| Plan compiler | TypeScript in the QuickJS guest | TypeScript | Runs once for each edit. One implementation |
| Session, clock, drivers | Native C++ | TypeScript and a worklet | Thread and device control |
| Control executor | Native C++ | The same source as WebAssembly | One definition of each operation |
| Render executor | Native C++ on wgpu-native | TypeScript on WebGPU, the existing `Executor` | The GPU does the work. Two executors exist today |
| Shaders | WGSL | WGSL | N4 |
| Audio executor, built-in kernels | Native C++ | The same source as WebAssembly in an AudioWorklet | N2. Native code is 2 to 8 times faster where SIMD applies |
| User and pack kernels | WebAssembly in Wasmtime | WebAssembly in the worklet | N3. Equal to native on recurrences, bounded by a deadline, one binary for both hosts |
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
| 99th percentile | 2.90 ms |
| Underruns in a 10 minute run | 0 |

Capacity that follows from section 3.4, on the measured machine:

| Engine | One stereo biquad for one quantum | Stereo biquads at 50% load |
|---|---|---|
| Native or WebAssembly | 0.63 µs | About 2,300 |
| QuickJS | 10.3 µs | About 140 |

Latency:

| Path | Target |
|---|---|
| Param change to picture | 2 frames |
| Param change to sound | Ring lead, device latency and one quantum. About 36 ms with the default lead and a device latency of 10 ms |
| Analysis value to picture | 0 frames of error (section 8) |
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
  SurfaceTarget surface;        // empty: render to a texture
  int sampleRate = 44100;
  AudioBackend audio = AudioBackend::Null;
  FrameRate frameRate;          // display, or a fixed rate
  int width = 1920, height = 1080;
};

class LiveSession {
public:
  void update(std::string graphJson);                 // compile and swap
  void setParam(std::string nodeId, std::string field, std::string valueJson);
  void play(); void pause(); void reset();
  void resizeSurface(int width, int height);
  void detachSurface();
  LiveStats stats() const;
};
```

A session sends `ProcessingMessage` objects through the same handler as a job:
a `job_update` with the status `running`, a `node_update` for each node error,
and a stats message at 4 Hz or less.

### 14.2 Node editor

The editor shows the picture in a `QWindow` inside
`QWidget::createWindowContainer` and passes its native handle to the session.
Play, pause and reset sit beside the picture. A graph with a live output opens
a session when the creator runs it, and the status text names the nodes that
run live.

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

The browser keeps its existing shader `Executor`. A render loop drives it from
the same IR. Audio runs in an AudioWorklet that loads the control executor,
the audio executor and the kernels as one WebAssembly module. Shared memory
between the page and the worklet needs cross-origin isolation. Without it,
params travel as messages and arrive one or more quanta later.

## 15. Offline rendering and tests

Offline mode uses the exact clock (D7b). For each video frame it renders the
quanta that end before the next frame time, then the frame. Readbacks use the
staging ring of section 9.5.

| Test | Evidence |
|---|---|
| IR snapshots | A fixture graph compiles to the stored IR |
| Audio parity | The native kernels and their WebAssembly builds give the same bytes for each fixture (N6) |
| Frame goldens | Offline frames on the software adapter match stored frames within a tolerance |
| Realtime rules | The allocation counter of F13 reads zero on the audio render thread across a run. ThreadSanitizer covers plan swaps under load |
| Stall | The worker sleeps for 500 ms during a session with the null device. The run has no underrun and no missed frame |
| Swap continuity | An edit to one node leaves the output of an unchanged filter continuous across the swap |
| Check proof | Each new check fails on a deliberately invalid input, as the [harness rules][harness] require |

The CLI commands of section 14.3 are the harness. They get an entry in the
harness registry and a budget file, as the timeline keeps under
`native/timeline/budgets/`.

## 16. Delivery plan

| Phase | Work | Exit evidence |
|---|---|---|
| P0 | A spike outside the product: one shader chain on a wgpu surface in a Qt container window on macOS, one audio chain on the buffered driver, timestamped params, a deliberate worker stall | Recorded frame interval statistics, underrun counts, pipeline creation times and the Wasmtime call check of R3 |
| P1 | `native/realtime` core, headless: IR loader, control executor, render executor, audio executor, first kernels, offline driver, CLI | Section 15 tests pass, except stall and swap |
| P2 | `audio-io` extraction, buffered driver, surface presentation, clocks, param table | Stall test passes. `live bench` meets section 13 on the reference machine |
| P3 | Compiler, live descriptors for the catalog nodes and the audio nodes, slots, slot-write node, editor picture and transport | The example of section 1 runs in the editor. Swap continuity passes |
| P4 | WebAssembly kernels, custom shader node, analysis taps, feedback nodes | Audio parity passes. A kernel with an endless loop is bypassed without an underrun |
| P5 | Browser executors | The P1 fixtures give the same audio bytes and matching frames in the browser |
| P6 | Encoded export, capture sinks, taps into batch regions | An export of a fixture plays in sync |

P0 decides R1 and R3 before P1 starts.

## 17. Failure handling

| Failure | Detection | Behavior |
|---|---|---|
| A kernel passes its deadline | Epoch trap | The node is bypassed, the error goes to the node, the session continues |
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
- R2. A local model on the same GPU delays frames, because a GPU queue cannot
  be preempted. The session reports the misses. Mitigations are a remote
  provider, a second GPU or a lower frame rate.
- R3. Calls into Wasmtime on a realtime thread may allocate or use trap
  handlers that need per-thread setup. If P0 fails this check, user kernels run
  under the buffered driver only, with a longer lead.
- R4. The product then has two GPU stacks: QRhi in the timeline and wgpu here.
  A live source in the timeline needs a texture exchange or a readback.
- R5. Hardware-decoded video frames enter wgpu through a CPU upload, about
  3 MB for a 1080p NV12 frame. Several 4K streams need an import path that
  `webgpu.h` does not have.
- R6. The browser build needs a C++ toolchain for `wasm32` in CI.
- R7. A custom WGSL shader with a long loop can stall the GPU. The device-lost
  path is the only defense.
- R8. The operator set can grow without limit. Each addition needs a creator
  request and a fixture.
- R9. The realtime thread class can need an entitlement or a system service
  that a packaged app lacks.

## 19. Open questions

- Q1. Does a run of a graph with a live output always open a session, or does
  the creator choose between a session and a finite render?
- Q2. Are the live outputs new node types, or do the existing
  `nodetool.audio.realtime.AudioOutput` and the `Output` node take that role
  inside a session?
- Q3. Is the session rate always 44.1 kHz, or does it follow the device with
  44.1 kHz for file and stream sinks only?
- Q4. Is the picture size a session setting or the size of the window?
- Q5. Should existing image nodes get live descriptors, or should live work
  use the generated catalog nodes only?
- Q6. Which tap policy does a live-to-batch loop need first: on request or
  when idle?
- Q7. Does the browser render loop run on the main thread or on a worker with
  an `OffscreenCanvas`?

## 20. Related documents

- [Graph runner README][gr-readme]
- [Asynchronous host operations][async-host]: jobs, lanes and mailboxes
- [Graph runner execution][gr-exec]
- [Native timeline design][tl-design]: clock, audio and preview decisions
- [Native rules][native-rules]: ownership and thread rules for this code
- [Reactive sessions][rs-plan] and [shared variables][sv-plan]: the finite
  side of an interactive session
- [Harness-first rules][harness]

## Appendix A. Benchmark method

The benchmark is a scratch program, not checked in. P1 replaces it with
`live bench`.

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
[gr-runner]: ../../native/graph-runner/src/kernel/runner.cpp
[gr-gpu]: ../../native/graph-runner/src/host/gpu_device.h
[gpu-ctx]: ../../packages/gpu/src/context.ts
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
