# Batch and live audio before the realtime engine: implementation plan

This plan gives NodeTool one way to run audio in real time and offline before
the engine of the [realtime design](graph-runner-realtime.md) exists. It keeps
the chunk streams of the TypeScript and C++ kernels as the executor. The
kernels, the effect descriptors and the node types of this plan stay when the
engine replaces that executor (section 8).

Cross-plan references use `AS-`, for example `AS-D4`. References to the
realtime design use `RT-`, for example `RT-D17` or `RT 10.1` for a section.

Citations of the kernel library refer to pull request #7447 at `e7b8ee6ccb`,
which is on `main`. Other citations are relative to the repository root at
`87062066bd`.

## 1. Goal

One patch must run in each of these three ways with the same samples:

| Case | Graph | Result |
|---|---|---|
| Live synth | `Gate ▶ ADSR ▶ VCA ◀ Oscillator`, then `Reverb ▶ Audio Out` | Sound in the editor until the creator stops the run |
| Offline render | The same patch, with `Chunks To Audio` and a duration of 4 s in place of `Audio Out` | A clip, rendered faster than real time |
| Live clip | `Audio To Chunks ▶ Phaser ▶ Audio Out` | The clip plays through the effect at its own speed |

The clip effects (`lib.audio.*`) keep their node types and their output.

Not in scope:

- A realtime thread, a ring buffer, a device clock or a plan compiler. Those
  belong to the realtime design.
- Latency below about 60 ms.
- Audio-rate feedback.
- A change to a clip editor (AS-D1).

## 2. Terms

| Term | Meaning |
|---|---|
| Clip | A finite audio asset. An `AudioRef` on a handle of type `audio` |
| Signal | A stream of chunks on a handle of type `chunk` or `cv`. Interleaved `float32` |
| Signal processor | A node whose output at a frame depends on the input up to that frame and on a small state |
| Clip editor | A node that needs the full clip or changes its length |
| Block | The frames of one chunk |
| Transport | One object for each run. It holds the sample rate, the block size, the mode and the end frame, and it paces the sources |
| Audio sink | A node class that declares `audioSink`. It decides the mode of the transport |

## 3. Starting point

- F1. Two node families exist. The synth nodes and the `Streaming*` nodes
  process signals ([`synthesis.ts`][synth], [`realtime-audio.ts`][rt-audio]).
  The `lib.audio.*` effects process a clip
  ([`lib-audio-effects.ts`][audio-effects], `lib-audio-dsp.ts`). Of the
  effects, only gain, low pass and high pass have a signal node.
- F2. The effect kernels of #7447 take a full buffer and keep no state:
  `nt_audio_bitcrush`, `_compress`, `_limiter`, `_reverb`, `_noise_gate`,
  `_phaser` and `_delay` (`native/kernels/include/nodetool/kernels.h`). The
  reverb and the delay allocate their delay lines inside the call
  (`native/kernels/src/audio.cpp`). Only the biquad and the synth kernels take
  a caller-owned state array.
- F3. Each free-running generator has its own `RealtimePacer` on the wall
  clock and runs until cancel (`runGenerator` in [`synthesis.ts`][synth],
  [`cv.ts`][cv]). A synth patch cannot render to a clip, because
  `Chunks To Audio` waits for an end marker that never arrives.
- F4. `Audio To Chunks` sends all chunks at once, reads WAV only and keeps the
  rate of the file ([`realtime-audio.ts`][rt-audio]). The live monitors keep
  about 100 ms of lead and drop older audio
  ([F31-F3 and F31-A7][f31]). A clip through signal nodes into `Audio Out`
  therefore loses most of its audio. This comes from source inspection. No run
  measured it.
- F5. `Oscillator`, `LFO` and `Gate` each have a `sample_rate` property.
  `SYNTH_SAMPLE_RATE` is 24000 and `SYNTH_CHUNK_FRAMES` is 512
  ([`cv.ts`][cv]). Clips have 44.1 kHz or 48 kHz. Nothing gives a patch one
  rate.
- F6. Two kernels run these nodes. The server and the browser use the
  TypeScript runner ([`runner.ts`][ts-runner]). The native graph runner uses a
  C++ kernel that calls the same node classes in its guest
  ([`entry.mjs`][gr-entry]). Each has its own context class, and both provide
  `get(key, defaultValue)` and `set(key, value)`
  ([`context.ts`][ts-context], [`host/context.mjs`][gr-context]). A flag of a
  node class already reaches both kernels through the node metadata:
  `alwaysEmitOutputUpdates` ([`node-metadata.ts`][node-metadata],
  [`entry.mjs`][gr-entry], [`runner.cpp`][gr-runner]).
- F7. Both kernel backends copy each buffer into the callee and back for each
  call: the WebAssembly backend (`packages/kernels/src/wasm.ts`) and the
  runner capability (`native/graph-runner/src/host/kernels.cpp`). A state
  array therefore costs one copy in and one copy out for each block.
- F8. The clip filters use the Web Audio design
  (`nt_biquad_design_webaudio`). `Streaming Low Pass` and
  `Streaming High Pass` use the RBJ design
  (`runStreamingFilter` in [`realtime-audio.ts`][rt-audio]). The two designs
  give different samples for the same properties.
- F9. The clip delay returns more frames than it gets: the input and four
  echoes (`nt_audio_delay_output_frames`). Each other effect returns the frame
  count of its input.
- F10. In a local run of the node editor, a clip result is inline base64. The
  editor takes at most 2 MB of media for each run entry
  ([`RunOutputModel.cpp`][ne-runoutput]), and
  [`LocalMediaStore`][ne-localstore] holds images only. A rendered clip longer
  than about 20 s at 44.1 kHz mono gets no player.

## 4. Decisions

- D1. Audio nodes have two classes.

  | Class | Nodes | Runs on |
  |---|---|---|
  | Signal processor | All `nodetool.audio.synth.*` nodes. Gain, the five filters, Bitcrush, Compress, Distortion, Limiter, Noise Gate, Reverb, Phaser, Delay | A signal, and a clip through the same kernel |
  | Clip editor | Normalize, Reverse, Trim, Slice, Fade In, Fade Out, Concat, Repeat, Remove Silence, Overlay, Audio Mixer, Pitch Shift, Time Stretch, Mono To Stereo, Stereo To Mono | A clip only |

  This is the split between a live region and a batch region of RT 5.3.

- D2. Each signal kernel has three functions: the state length, an init
  function and a block function. The state is a flat array that the caller
  owns. The block function allocates nothing. This is the shape of RT 10.1.
  The full-buffer function of F2 stays and calls the three functions, so each
  clip node gives the bytes it gives today.

- D3. Each effect has one descriptor in TypeScript. It names the kernel, maps
  the node properties to the kernel params and gives the tail length. Two
  drivers read it. `applyToClip` decodes a clip, runs the kernel over the full
  buffer and encodes the result. `applyToSignal` runs the kernel on each chunk
  and keeps the state. Each effect has two node types: the clip node of today
  and a signal node `nodetool.audio.realtime.Streaming<Name>`. The handle
  types stay exact, and the type system needs no change (Q1).

- D4. A run has one transport.

  | Field | Value |
  |---|---|
  | `sampleRate` | 44100 (Q2) |
  | `blockFrames` | 1024, which is 8 quanta of RT 10.1 and 23.2 ms |
  | `mode` | `live`, `render` or `free` |
  | `endFrame` | The last frame of a render. Null in the other modes |
  | `until(frame, signal)` | Resolves when a source may emit that frame |

  The block size is equal in all modes. `VCF` reads its control input once
  for each block, so equal blocks give equal samples in a live run and in a
  render. A block of 1024 frames at 44.1 kHz gives 43 chunks a second on each
  edge. Today's 512 frames at 24 kHz give 47.

- D5. The audio sinks of the graph decide the mode before the first node
  starts, as RT-D2 pulls from the live outputs.

  | Graph | Mode | Sources |
  |---|---|---|
  | An `Audio Out` (`audioSink = "live"`) | `live` | Paced by one wall clock. Generators run until cancel |
  | No live sink, and a `Chunks To Audio` with a `duration` above 0 | `render` | Not paced. Each source ends at `endFrame`, the largest duration |
  | Neither | `free` | As today. Generators are paced and run until cancel. `Audio To Chunks` is not paced and does not resample |

  A context without a resolved mode gives `free`. A host that does not resolve
  the mode therefore behaves as today.

- D6. `Audio To Chunks` is the player, and `Chunks To Audio` is the recorder.
  They keep their node types. In `live` and `render` mode the player decodes
  any format, resamples to the run rate and follows the transport. The
  recorder gets a `duration` property. A duration of 0 records to the end of
  the stream, as today.

- D7. A signal effect with a tail emits the tail after the end marker of its
  input. Only the delay has one (F9).

- D8. The node editor keeps a clip of a local run in the process-local media
  store, as it keeps images (F10).

## 5. Rules for every work package

- One work package is one pull request.
- Follow the [native rules](../../native/AGENTS.md) for C++ and the
  [audio node rules](../../packages/audio-nodes/AGENTS.md) for the nodes.
- Add each test under "Exit evidence". Prove that a new check fails on a
  wrong input, as the [harness rules](../HARNESS_FIRST.md) require.
- A work package that adds or changes a node follows
  [Adding or changing a node](../../packages/AGENTS.md#adding-or-changing-a-node):
  the pinned node lists, `npm run codegen:dsl`, `npm run build:sandbox-dsl`,
  `npm run build:sandbox-flow` and `npm run generate:node-docs`.
- A work package that changes a node of the runner's parity inventory runs
  `node parity/inventory.mjs` and `node parity/generate-cases.mjs` in
  `native/graph-runner`. `node parity/run.mjs --check` runs on Linux.
- After a change to `native/kernels`, run
  `node native/kernels/scripts/build-wasm.mjs` and commit the generated file.
- Run the mandatory checks of the
  [root AGENTS.md](../../AGENTS.md#mandatory-post-change-verification).
- A clip node must give the same bytes before and after each work package.
  `packages/kernels/tests/parity.test.ts` holds this.

## 6. Work packages

| WP | Title | Depends on |
|---|---|---|
| WP1 | Stateful effect kernels | #7447 |
| WP2 | Run transport and offline render of the synth | #7447 |
| WP3 | Effect descriptors and signal effect nodes | WP1 |
| WP4 | Player: decode, resample and pace `Audio To Chunks` | WP2 |
| WP5 | Node editor: clips in the local media store, and examples | WP3, WP4 |

```
#7447 ─┬─▶ WP1 ─▶ WP3 ─┐
       └─▶ WP2 ─▶ WP4 ─┴─▶ WP5
```

WP1 and WP2 can run in parallel. The store part of WP5 has no dependency and
can start first.

### WP1. Stateful effect kernels

Scope: `native/kernels`, `packages/kernels`,
`native/graph-runner/src/host/kernels.cpp`. No node changes.

1. Add the three functions of D2 for bitcrush, compress, limiter, noise gate,
   phaser, reverb and delay. Distortion has no state and needs no change.
2. Keep the conventions of `kernels.h`: interleaved `float32`, a state array
   of the documented length, zero-filled as the initial state where the
   kernel allows it, defined results for each double.
3. Size the state from the sample rate, the channel count and the structural
   params. The delay time is the one structural param. A change of it creates
   a new state.
4. Limit the delay of the block function to
   `NT_AUDIO_MAX_STREAM_DELAY_SECONDS`, 2 s, because of F7. The clip delay
   keeps its limit of 60 s.
5. Rewrite each full-buffer function of F2 as init, one block call over the
   buffer and, for the delay, the tail of F9.
6. Add the typed methods to `Kernels` in `packages/kernels/src/index.ts`: a
   `create<Name>State` function and a block method for each effect.
7. Add an adapter for each new function to the runner capability, with the
   buffer checks that the other adapters have.
8. Update the kernel table of `native/kernels/README.md`.

Exit evidence:

- `kernels_tests`: for each effect, the block function over a buffer split at
  1, 127, 128, 1024 and random lengths gives the bytes of one call over the
  full buffer.
- `kernels_tests`: the hostile-double test covers each new function under
  UBSan, and the suite passes under ASan.
- `packages/kernels/tests/parity.test.ts` passes without a change to its
  reference loops.
- `packages/kernels/bench` and `kernels_bench` record the time of one block
  of 1024 frames for the reverb and for a delay of 2 s, stereo, on both
  backends. The time includes the state copies of F7. R1 gives the limit.
- `node native/kernels/scripts/build-wasm.mjs --check` passes.

### WP2. Run transport and offline render of the synth

Scope: `packages/node-sdk`, `packages/protocol`, `packages/execution-core`,
`native/graph-runner/guest`, `packages/audio-nodes`.

1. Add `static readonly audioSink?: "live" | "render"` to `BaseNode`. Carry
   it in the node metadata as `audio_sink`, beside
   `always_emit_output_updates` (F6).
2. Add a pure function `resolveAudioRun(nodes)` that implements the table of
   D5. It reads the `audio_sink` flag and the static `duration` property of
   each node of the top-level graph. Put it where both hosts can import it
   without a new dependency.
3. Call it once for each run, before the first node starts, and store the
   result in the context under one exported key:
   - in the TypeScript runner, where the run starts
     ([`runner.ts`][ts-runner])
   - in the runner guest. `prepareGraph` sees the graph and `begin` creates
     the context ([`entry.mjs`][gr-entry]). Confirm their call order first
     (R2).
4. Add `packages/audio-nodes/src/lib/transport.ts`. `getTransport(context)`
   builds one transport for each context from the stored result. It gives
   `free` mode when the key is absent. In `live` and `free` mode, `until`
   waits for `start + frame / sampleRate` on one clock that starts with the
   first call. In `render` mode it resolves at once.
5. Move `Oscillator` (free-running path), `LFO` and `Gate` to the transport.
   Delete `RealtimePacer` and the pacer of `runGenerator`. Remove the
   `sample_rate` properties and `SYNTH_SAMPLE_RATE` (F5). A generator ends
   with an end marker at `endFrame`.
6. Set `audioSink = "live"` on `AudioOutputNode`. Set `audioSink = "render"`
   on `ChunksToAudioNode` and add its `duration` property in seconds. With a
   duration above 0 the recorder returns its clip after that many frames. In
   `live` mode the patch keeps playing after that.
7. Update the node descriptions that say "wall-clock paced".

Exit evidence:

- A unit test of `resolveAudioRun` covers each row of D5, two recorders with
  different durations and a graph with both sink kinds.
- A node test renders `Gate ▶ ADSR ▶ VCA ◀ Oscillator ▶ Chunks To Audio` with
  a duration of 2 s. The run ends without a timer call, and the clip has
  88200 frames.
- A node test runs the same patch in `live` mode on a fake clock. Its first
  2 s equal the rendered clip sample for sample.
- A node test shows that a context without the key gives `free` mode and an
  endless, paced generator.
- A metadata test shows `audio_sink` for the two sink classes and for no
  other class.
- A fixture graph in `native/graph-runner/tests/graphs/` renders the patch in
  the runner. Its ctest compares the frame count and a hash of the samples
  with the node test.
- The parity cases of `synthesis.ts` and `realtime-audio.ts` are regenerated.

### WP3. Effect descriptors and signal effect nodes

Scope: `packages/audio-nodes`, the DSL and docs copies.

1. Add `packages/audio-nodes/src/lib/signal-effect.ts` with the descriptor
   type and the two drivers of D3.
2. `applyToSignal` must do the following:
   - create the state on the first chunk, and again when the channel count,
     the rate or a structural param changes
   - read the node properties for each block, so a live property change
     applies at the next block
   - write into a new buffer and never into the input, because a fan-out
     edge shares the input array
   - emit the tail of D7, then the end marker
3. Write a descriptor for each effect of D1. Declare the properties of an
   effect once for both node types. Check first whether `@prop` works through
   a shared base class (R5).
4. Move the clip nodes of `lib-audio-effects.ts` and the gain and filter
   nodes of `lib-audio-dsp.ts` to `applyToClip`.
5. Add the signal nodes for Low Shelf, High Shelf, Peak, Bitcrush, Compress,
   Distortion, Limiter, Noise Gate, Reverb, Phaser and Delay. Each new filter
   node uses the design of its clip node (F8).
6. Move `Streaming Gain`, `Streaming Low Pass` and `Streaming High Pass` to
   descriptors. They keep their types, their properties and the RBJ design.
7. Register the new nodes in `REALTIME_AUDIO_NODES`, so they run on the
   server and in the browser.
8. Add the signal processor rules of step 2 to
   [`packages/audio-nodes/AGENTS.md`](../../packages/audio-nodes/AGENTS.md).

Exit evidence:

- For each effect, a test splits a clip into blocks, runs the signal node and
  compares the joined output with the clip node. The samples are equal, with
  the tail for the delay.
- Default controls change samples for effects with non-neutral defaults.
  Gain, Low Shelf, High Shelf and Peak retain their neutral 0 dB defaults
  for clip compatibility. Tests cover their neutral output and the change
  produced by a non-zero gain.
- A test changes a property between two blocks and finds the change in the
  second block.
- A test sends one input array to two consumers and finds it unchanged.
- The clip node tests and `packages/kernels/tests/parity.test.ts` pass
  without a change to an expected value.
- The DSL copies, the node docs and the parity inventory contain the new
  nodes.

### WP4. Player: decode, resample and pace `Audio To Chunks`

Scope: `native/kernels`, `packages/kernels`, the runner capability,
`packages/audio-nodes`.

1. Add `nt_resample`, a windowed-sinc resampler over a full interleaved
   buffer, with its typed method and its capability adapter. The output has
   `round(frames * outRate / inRate)` frames. Equal rates return the input.
2. In `AudioToChunksNode`, decode with `decodeAudioToWav`, which reads each
   format that the clip effects read.
3. In `live` and `render` mode, resample the clip to the run rate once and
   wait for `transport.until` before each chunk. In `free` mode keep the
   behavior of today (D5).
4. Add a `loop` property. A looped clip starts again at its end. In `render`
   mode it stops at `endFrame`.
5. Keep `chunk_duration`. The consumers align by frame count
   (`alignedSignalStreams` in [`cv.ts`][cv]), so a player block need not have
   the length of a generator block.

Exit evidence:

- `kernels_tests`: a 1 kHz sine from 48 kHz to 44.1 kHz keeps its frequency
  and has a signal-to-noise ratio above a stated bound. The frame count
  follows the rule of step 1.
- A node test in `live` mode on a fake clock: chunk k leaves the player at
  the start time of chunk k. This reproduces F4 and then passes.
- A node test in `render` mode:
  `Audio To Chunks ▶ Streaming Reverb ▶ Chunks To Audio` gives the samples of
  `lib.audio.Reverb` on the same clip at 44.1 kHz.
- A node test for `loop` in both modes.
- A node test shows that `free` mode gives the chunks of today for a WAV
  input.

### WP5. Node editor: clips in the local media store, and examples

Scope: `native/node-editor`.

1. Extend [`LocalMediaStore`][ne-localstore] to hold the bytes of a clip, and
   give the result a store locator in place of inline base64 (D8). Find how
   the card player and the run output player read a store entry. Images use
   an image provider, and a `QMediaPlayer` needs a device or a file.
2. Remove the size limit of F10 for a clip that is in the store.
3. Add three examples to `examples/`: the three cases of section 1.
4. Add widths for the new signal nodes to the table in
   [`NodeCreation.cpp`][ne-nodecreation] where the default does not fit.
5. Update the Examples section of the editor README.

Exit evidence:

- `CanvasMediaHostTest`: a `node_update` with 60 s of inline WAV gives a
  loaded player on the card. The test fails before the change.
- `LocalRunTests`: the render example ends, and its clip has the frame count
  of its duration.
- `LocalRunTests`: the live example delivers PCM to the `Audio Out`
  controller within 1 s and stops on cancel.
- `MenusTest`: the example menu lists the new files.
- The editor ctest suite passes.

## 7. Hosts

| Host | Kernel | Gets the plan through |
|---|---|---|
| Server | TypeScript runner, kernels as WebAssembly | WP1 to WP4 |
| Web editor, in-page runs | TypeScript runner in the browser, kernels as WebAssembly | WP1 to WP4. The players read the rate from the chunk metadata ([F31-F3][f31]) |
| Native node editor, local runs | C++ kernel, native kernels | WP1 to WP5 |
| `nodetool node run` | One node, no graph | `free` mode |

## 8. What the realtime engine replaces

| This plan | Realtime design | At the transition |
|---|---|---|
| Stateful effect kernels (D2) | First kernels of RT 10.1, RT-D17 | RT WP07 wraps them in the final kernel interface |
| Effect descriptor (D3) | `dsp` live descriptor of RT 6.1 | RT WP17 reads the kernel id and the param mapping |
| Signal node types (D3) | Nodes of a live region, RT 5.3 | They keep their types and get the descriptor |
| `audioSink` flag (D5) | Live outputs, RT-D2 and RT-Q2 | The compiler pulls from the same nodes |
| Transport (D4) | Session clock, rate and quantum, RT 8 and RT 10.1 | The session replaces it |
| Player and recorder (D6) | Buffer slot and capture sink, RT 10.4 | The compiler maps them |
| Chunk streams between actors | Audio plan executor | Replaced |

## 9. Accepted limits

- The latency from a property change to the sound is one block and the lead
  of the monitor, about 60 ms to 150 ms.
- A node body that computes for a long time on the guest thread stops the
  stream for that time, because one thread owns the guest (RT-F2).
- The wall clock of the transport and the clock of the audio device drift.
  The monitor drops or pads audio when the lead leaves its range.
- The mode comes from the top-level graph. An audio sink inside a subgraph
  does not set it.
- A connected `duration` input does not set `endFrame`. Only the static
  property does.

## 10. Risks

- R1. The state copies of F7 cost time for each block. A stereo delay of 2 s
  copies about 700 kB in each direction. The WP1 bench must show less than
  1 ms for one block on both backends. Above that, the backend owns the state
  block and the call passes a handle, as RT 10.5 keeps state in the module
  memory.
- R2. The guest may create the context after it prepares the graph (F6). If
  the order does not allow WP2 step 3, the C++ kernel passes the resolved mode
  to `begin`.
- R3. In `render` mode a source is not paced, and the inboxes have no limit
  in the C++ kernel. The memory is bounded by the render length. The
  `duration` property needs a maximum. 600 s is the first value.
- R4. The rate rises from 24 kHz to 44.1 kHz. The block of 1024 frames keeps
  the message rate, but each `output_update` of `Audio Out` carries about
  twice the bytes. Measure the runner path with a live patch in WP2.
- R5. `@prop` may not support a shared base class. The fallback builds both
  classes of an effect from one function, as the FAL node factory builds its
  classes.
- R6. The removal of `sample_rate` changes saved workflows that set it. The
  value is ignored after WP2. The parity baseline of the synth nodes changes.

## 11. Open questions

- Q1. Does each effect keep two node types, or does one node get a clip port
  pair and a signal port pair? This plan uses two types. One node gives one
  menu entry and four ports on each card.
- Q2. Is the run rate 44.1 kHz or 48 kHz? This is RT-Q3. The rate is one
  constant in `transport.ts`.
- Q3. Does the node menu show the clip effect and the signal effect in one
  group, or in the two namespaces of today?

[synth]: ../../packages/audio-nodes/src/nodes/synthesis.ts
[rt-audio]: ../../packages/audio-nodes/src/nodes/realtime-audio.ts
[audio-effects]: ../../packages/audio-nodes/src/nodes/lib-audio-effects.ts
[cv]: ../../packages/audio-nodes/src/lib/cv.ts
[f31]: ../../native/node-editor/docs/streaming-audio-parity.md
[ts-runner]: ../../packages/execution-core/src/runner.ts
[ts-context]: ../../packages/runtime/src/context.ts
[node-metadata]: ../../packages/node-sdk/src/node-metadata.ts
[gr-entry]: ../../native/graph-runner/guest/entry.mjs
[gr-context]: ../../native/graph-runner/guest/host/context.mjs
[gr-runner]: ../../native/graph-runner/src/kernel/runner.cpp
[ne-runoutput]: ../../native/node-editor/src/run/RunOutputModel.cpp
[ne-localstore]: ../../native/node-editor/src/media/LocalMediaStore.h
[ne-nodecreation]: ../../native/node-editor/src/graph/NodeCreation.cpp
