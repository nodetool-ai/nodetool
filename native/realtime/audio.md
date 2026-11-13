# Audio executor

`AudioExecutor::prepare` lowers the audio projection of an IR document through
the canonical loader and built-in kernel registry. It validates compiler order,
port layouts, buffer lifetimes, scalar parameter bindings, state versions and
structural configuration before creating an executor. Control producers remain
in the validated projection to check `audioControl` references, using the
built-in control registry. The host still prepares control instructions and
executes them separately. Render plans need their own validation and execution.
A rejection leaves the active executor unchanged.

The prepare thread allocates every PCM buffer, sink copy, event array, parameter
array and aligned state block. The executor uniquely owns them and the immutable
buffer-slot payloads. Kernel pointers borrow that storage only during a call.
The host transfers the executor to one audio-render thread and destroys it after
that thread stops. This implementation creates no thread, device, ring or callback.

## Kernel ABI

[dsp.h](include/nodetool/realtime/dsp.h) compiles as C. ABI 1 descriptors specify
input/output counts, parameter count, supported event types, state version,
state size, initialization and processing. Port lanes are planar float32 in
`port * channels + channel` order. Each built-in port has the session's mono or
stereo layout. There is no implicit channel conversion.

The host supplies valid descriptors and configuration, complete planar buffers,
parameter endpoint arrays and sorted, in-range event offsets. Optional per-sample
parameter arrays override the endpoints for nonlinear smoothing. Configurations use
44.1 or 48 kHz, 128-frame quanta and one or two channels. State is a cleared,
16-byte-aligned flat block with no owning pointers. The delay line is stored in
the same block after its header. `init` and executor `reset` run while stopped.
`process` allocates nothing and performs no I/O or locking.

Pointers stay within the executor's address space. The same source can later
compile with wasm32 pointers into module memory. ABI 1 is a target-local calling
interface, not a serialized native/Wasm wire layout. That build and byte parity
are still unverified (WP24). Fast-math and FMA contraction remain disabled for
all kernel targets (RT-N6).

## Built-in kernels

Parameter order is significant. Each IR audio node lists slot IDs in this order.
The prepare step rejects missing or extra parameters.

| Name | Inputs | Parameters and behavior |
|---|---|---|
| `oscillator` | None | Frequency Hz, amplitude. Sine starts at phase zero, then advances per sample. Frequency is limited to positive or negative Nyquist. Mono signal is copied to each output channel |
| `noise` | None | Amplitude. Deterministic noise keyed by session seed, graph-node identity and sample index. Mono signal is copied to each channel |
| `gain` | One | Gain |
| `mix` | Two | First and second input gains. Sums corresponding channels |
| `biquad.lowpass`, `biquad.highpass`, `biquad.bandpass`, `biquad.notch`, `biquad.allpass` | One | Frequency Hz, Q, gain dB. Gain is reserved and unused for these filter types |
| `biquad.peaking`, `biquad.lowshelf`, `biquad.highshelf` | One | Frequency Hz, Q, gain dB. Shelves use Q-derived alpha |
| `delay` | One | Feedback and wet fraction. Feedback is limited to `[-0.999, 0.999]`, wet to `[0, 1]`. Required structural `delayFrames` is between 1 and 480,000 |
| `sample-player` | None | Gain. Required `bufferSlot` names prepared PCM. Plays once at session rate, then returns silence |
| `level-meter` | One | No parameters. Passes PCM through and publishes per-quantum peak/RMS by channel through `meter(nodeIndex)` |

Biquads use transposed direct-form II with double state. Frequency is limited
to `[1, 0.49 * sampleRate]`, Q to `[0.01, 100]` and gain to `[-60, 60]` dB.
Sine and power come from the project math source. Constant parameters compute
coefficients once per quantum; ramps compute them per sample. Decaying filter
and delay state below magnitude `1e-30` is cleared explicitly (RT-R13).

`delay` has internal feedback but reads its current input during execution. It
does not authorize graph cycles. The later `BlockDelay` read/write phases and
cross-plan state migration belong to WP23 and WP18.

## Parameters, events and slots

The offline driver resolves optional `audioControl` register bindings into the
same dense snapshot used by other hosts. `AudioExecutor` does not evaluate
control registers itself. The offline host samples scalar values at quantum
endpoints, rejects non-finite or out-of-float-range results and passes the
snapshot to existing smoothing. The parameter's initial `value` remains the
starting point for ramps and one-pole smoothing.

`parameterSlots()` exposes a dense list of referenced audio parameter IDs in IR
declaration order. IDs may be sparse. A caller provides one stable snapshot in
that order. The executor copies it once before running nodes. `smooth: ramp`
interpolates the previous endpoint to the new endpoint over frames 0 through
127. `smooth: none` applies the new value throughout the quantum. `smooth: onePole`
requires `timeConstant` in seconds, greater than zero and at most 60. Its per-sample
coefficient is `exp(-1 / (timeConstant * sampleRate))`. A failed read uses
`valid: false` and retains the previous target while smoothing continues. The initial endpoint is
the IR default. Vector parameters cannot bind to audio kernels.

The host is responsible for taking the snapshot without concurrent mutation.
Seqlock acquisition, applied revisions, control-register bindings and
cross-domain synchronization are not implemented here.
WP09 composes execution; WP13 supplies the parameter handoffs. The executor does
not invent synchronization for borrowed spans.

Events identify a prepared node index and absolute stream frame. They are sorted
by stream frame, with input order retained for ties. Oscillator and noise support
`RESET`. The sample player supports `RESET`, `START`, `STOP` and integer-frame
`SEEK`. Seek positions range from zero through the asset length. Reset rewinds
and starts playback. Events apply before the sample at their offset.

The process result returns a consumed prefix length. Future events remain with
the caller, including an event exactly at the next quantum boundary. Late events
apply at offset zero and are counted. Unsupported events, invalid snapshots,
out-of-range seeks, unsorted input and oversized event batches reject the entire
call before changing state or advancing stream time. Default event capacity is
4,096, configurable at preparation up to 65,536.

Buffer slots own planar float32 samples in channel-major order. The caller must
decode and resample them to session rate before preparation. Bindings must match
an IR buffer-slot declaration and the session channel layout. Slot replacement
and retirement queues are later work. Preparation tracks PCM capacities, state,
events and descriptor storage against a configurable 256 MiB default budget.
This excludes temporary JSON validation/maps and allocator overhead.

## Sinks and verification

Every sink owns an output copy independent of reused working buffers. A scan
replaces each non-finite sample with silence and counts it, separately for each
sink. Finite samples are preserved. The result's counters describe that quantum;
the host can accumulate them. Sink spans remain valid until the next process,
reset or executor destruction. Returning a span does not transfer ownership.

`realtime-audio-executor` checks kernel reference outputs, stereo port routing,
liveness reuse, ramp endpoints, same-frame event order, late/future events,
failed snapshots, invalid preparation, non-finite sinks and byte-identical repeat
runs. Filter and delay tests render a signal followed by silence, check that tiny
state clears, and report render time. Their broad timing guard detects severe
regressions; it is not a device deadline measurement. The ordinary build counts
C++ allocations with a positive control. Sanitizer runs use a separate ordinary
run for that audit. `realtime-dsp-c-abi` compiles and links a C consumer.

Device workgroups, realtime scheduling, ring behavior under load, audible swaps,
hardware rate conversion and sound-to-picture alignment remain unverified.
See [M1 status and M0 dependencies](M1_STATUS.md). No offline test replaces that
evidence.
