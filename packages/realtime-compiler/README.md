# Realtime compiler

Pure WP16 preparation against the [canonical plan schema](../../native/realtime/schema/README.md).
The compiler handles one render sink or one audio sink. Render graphs support
registered shader/control descriptors, property/expression uniforms, render-domain
state and explicit batch texture boundaries. Audio graphs support built-in DSP
DAGs with property/control parameters. Results contain plan data, boundary reports,
parameter allocation and state keys, or graph-node diagnostics, without I/O.

```ts
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
const result = compileRealtimeGraph({ graph, descriptors, outputs: [outputId], session, revision });
```

Descriptors are host-supplied contracts, not graph properties. Boundary textures
require explicit output contracts. Plans preserve graph identities and use stable
escaped slot names. A color-space mismatch warns. Straight RGBA8 inputs receive
an explicit `alpha.straightToPremul@1` pass when a consumer requires premultiplied
alpha. Consumers of the same source share the conversion. Dimensions, color-space
tags and retention follow the source. Unsupported alpha conversions reject.
Cycles and workflow execution-control edges
reject. Node and edge input order does not change the compiled plan.

Shader uniforms accept a property binding or `{ field, expression }`. Expression
leaves are `{ kind: "literal", value }` or `{ kind: "property", property, default }`.
Operations are `{ kind: "operation", op, inputs }` using the supported analytic
operation names. A connected property reads its control register instead of its
stored value. Repeated property references share the same graph input port.
Expressions contain data and never execute JavaScript supplied by the graph.

Constant arithmetic, comparisons, remap and vector packing fold at compile time.
Division by zero and zero-range remap follow the [executor contracts](../../native/realtime/control.md#operation-contracts).
`pow` and `tanh` remain runtime instructions to preserve the project's math.
Time and output-dimension sources also stay in the plan. Nonfinite fold results
remain runtime operations. Cyclic expressions, wrong arity, incompatible vector
widths and expressions beyond the compiler's size limit reject.

Audio descriptors specify an ABI 1 kernel, ordered input ports and parameters,
one output, a state version and an optional channel restriction. The compiler
validates the supported [built-in contracts](../../native/realtime/audio.md#built-in-kernels).
Each port uses the session layout. Parameter values are finite float32 scalars
with `none`, `ramp` or `onePole` smoothing and audio sync. Delay size is a
compile-time property. The delay kernel does not authorize graph feedback.
Pass ordering and buffer liveness are computed iteratively. Inputs remain live
through their last consumer, and outputs never overwrite inputs in the same node.

A DSP parameter's property port can connect to a live scalar control producer.
The compiler lowers that control region into the audio domain and emits an
`audioControl` register binding. Shared producers get one operation. The stored
parameter value supplies the initial smoothing endpoint. Offline execution samples
controls at quantum endpoints, independent of render frame rate, then applies the
declared smoothing. Vector producers and connected structural fields reject.
Runtime targets follow the native host's [scalar checks](../../native/realtime/audio.md#parameters-events-and-slots).
Audio and render lowering use the same control compiler. Sharing a stateful
producer between both domains still requires the deferred signal-history and
handoff work.

Pass the successful result's `allocation` back on the next call to preserve
parameter slots. This detached session ledger reserves removed `(node, field)`
identities, so removing/reintroducing a node cannot reuse another parameter's
slot. Discard the ledger when its session ends. The ledger is bounded, and
exhaustion rejects the candidate. It is not a cross-thread parameter table.

`stateKeys` contains SHA-256 identities for audio nodes and stateful controls,
using the design's graph identity, operation/version and session fields. Audio
keys also include structural delay size and channel layout. Nonstructural
parameter edits preserve those keys. Audio sink hashes include the logical
upstream edges, state keys, seed, initial parameter values, smoothing and control
dependencies. They exclude physical buffer IDs, parameter slot IDs and control
register numbers. Display dimensions enter a hash when a control reads them.
These are compiler metadata. State transfer and sink-ramp behavior remain WP18.

Build and test with `npm run build --workspace=packages/realtime-compiler` and
`npm run test --workspace=packages/realtime-compiler`. Both prepare the schema
asset from its canonical native source. The generated module is bundled for
browser/QuickJS hosts and ships in the package, with no runtime filesystem import.
Run `npm run test:native --workspace=packages/realtime-compiler -- <executable>`
for snapshot-to-native-loader/render and WAV checks with a configured software GPU.

WP16 remains open. Mixed audio/render graphs, cross-domain control sharing, render
parameter slots, PCM/sample-player boundaries, multiple sinks, the full descriptor
expression vocabulary, reverse/floating-point alpha conversion, delayed feedback,
batch graph rewriting and cross-domain stateful handoffs remain unimplemented.
This package does not register product node descriptors or integrate the runner,
editor or live devices. See the [deferral ledger](../../native/realtime/M1_STATUS.md#deferred-acceptance-work).
