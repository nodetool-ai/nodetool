# Realtime plan IR v1

[plan-v1.schema.json](plan-v1.schema.json) is the canonical JSON Schema for the
prepare-time description. The native build embeds this same file. A future
TypeScript compiler must consume it as an asset rather than maintain a second
schema. The native checker supports only the keywords used here and rejects
an unsupported keyword instead of ignoring it.

The schema is provisional under [M1's status and assumptions](../M1_STATUS.md).
`schemaVersion` identifies the wire format. `revision` identifies a plan edit.
Session rate, quantum, channel layout, dimensions and seed are explicit data.

## References and lifetimes

Audio inputs identify a producer graph node and its output-port index. Audio
outputs identify physical buffer declarations. This separates logical edges
from buffer reuse. The loader rejects overlapping lifetimes and unwritten
sink buffers. Without an explicit in-place kernel contract, a kernel cannot
overwrite a buffer it reads in the same call.

Texture inputs identify a texture slot or a render-pass node. Each producer
carries format, size rule, color-space tag and alpha mode. A consumer's trusted
host registry provides its input contracts. Alpha mismatches require an explicit
conversion pass. Color-space mismatches warn, as specified by design section
6.2. Pass outputs are premultiplied.

Control registers are scoped to their audio or render domain. Each register
has one producer. Stateful node identities may occur only once. The prepare
step will lower this description into instructions before execution.

Parameter identity is the pair `(node, field)`. Loading against a previous
validated description rejects a changed slot number for an unchanged identity.
Audio sinks carry the compiler's upstream `subgraphHash`. The loader checks its
representation, not the compiler's hash calculation.

Scalar audio parameters support `none`, `ramp` and `onePole` smoothing. Only
`onePole` requires a `timeConstant` in seconds, greater than zero and at most 60.
The [audio contracts](../audio.md) define sample timing and snapshot retention.

Audio nodes can carry `delayFrames` and `bufferSlot` structural fields. The
[audio executor](../audio.md) permits them only for `delay` and `sample-player`
respectively, validates the binding, and allocates state during preparation.

The host registry, not the untrusted plan, declares which operations exist and
which nodes provide delayed inputs. Removing those incoming dependencies must
leave each domain acyclic. Audio nodes and render passes must already be
topologically ordered after accounting for delayed inputs. Delayed audio inputs
remain live through the end of the quantum for the later delay-write phase.

## Loading

`loadPlan` allocates and validates on the prepare thread, returning a unique
owner of a const JSON description or a diagnostic with graph node, reason and
detail. It never changes the caller's active plan. Executors must lower the
description during preparation, never parse JSON during a frame or quantum.

Documents are limited to 64 MiB. Schema arrays are bounded, and register counts
are bounded independently. Cycle and liveness checks traverse their inputs
without recursive graph walks. Fixtures include a large chain and its cyclic
variant.

The core has no Qt, QuickJS, GPU or audio-device dependency. It reuses the graph
runner's pinned nlohmann JSON version and archive hash. Sanitizer presets and
the native core CI job exercise the loader. They do not supply M0's missing
hardware evidence.
