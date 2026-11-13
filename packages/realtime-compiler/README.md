# Realtime compiler

Pure WP16 preparation against the [canonical plan schema](../../native/realtime/schema/README.md).
The initial slice compiles one render sink, registered shader/control descriptors,
property uniforms, render-domain state and explicit batch texture boundaries.
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

Build and test with `npm run build --workspace=packages/realtime-compiler` and
`npm run test --workspace=packages/realtime-compiler`. Both prepare the schema
asset from its canonical native source. The generated module is bundled for
browser/QuickJS hosts and ships in the package, with no runtime filesystem import.
Run `npm run test:native --workspace=packages/realtime-compiler -- <executable>`
for snapshot-to-native-loader/render checks with a configured software GPU.

WP16 remains open. DSP/audio lowering, param-slot and structural state-key
allocation, expression folding, alpha conversion insertion, delayed feedback,
batch graph rewriting and cross-domain stateful handoffs remain unimplemented.
This package does not register product node descriptors or integrate the runner,
editor or live devices. See the [deferral ledger](../../native/realtime/M1_STATUS.md#deferred-acceptance-work).
