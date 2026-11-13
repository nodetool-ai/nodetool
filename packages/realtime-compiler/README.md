# Realtime compiler

Pure WP16 preparation against the [canonical plan schema](../../native/realtime/schema/README.md).
The initial slice compiles one render sink, registered shader/control descriptors,
property/expression uniforms, render-domain state and explicit batch texture boundaries.
It returns plan data, boundary reports and graph-node diagnostics without I/O.

```ts
import { compileRealtimeGraph } from "@nodetool-ai/realtime-compiler";
const result = compileRealtimeGraph({ graph, descriptors, outputs: [outputId], session, revision });
```

Descriptors are host-supplied contracts, not graph properties. Boundary textures
require explicit output contracts. Plans preserve graph identities and use stable
escaped slot names. A color-space mismatch warns. Alpha mismatches reject until
conversion insertion is implemented. Cycles and workflow execution-control edges
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

Build and test with `npm run build --workspace=packages/realtime-compiler` and
`npm run test --workspace=packages/realtime-compiler`. Both prepare the schema
asset from its canonical native source. The generated module is bundled for
browser/QuickJS hosts and ships in the package, with no runtime filesystem import.
Run `npm run test:native --workspace=packages/realtime-compiler -- <executable>`
for snapshot-to-native-loader/render checks with a configured software GPU.

WP16 remains open. DSP/audio lowering, param-slot and structural state-key
allocation, the full descriptor expression vocabulary, alpha conversion insertion, delayed feedback,
batch graph rewriting and cross-domain stateful handoffs remain unimplemented.
This package does not register product node descriptors or integrate the runner,
editor or live devices. See the [deferral ledger](../../native/realtime/M1_STATUS.md#deferred-acceptance-work).
