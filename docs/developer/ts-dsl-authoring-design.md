# TypeScript workflow authoring

The DSL defines operations in the existing NodeTool graph. The visual editor,
validator, kernel, and canonical source exporter share that graph. A factory
call registers an operation and does not execute a provider request.

## Runtime DSL

`Connectable<T>` admits a literal, `OutputHandle<T>`, or a node whose single
output has type `T`. Generated factories still declare their real output slots.
`resolveConnection()` normalizes direct inputs centrally, so traversal and
serialization continue to operate on explicit handles. Multi-output nodes must
select a slot, including when a low-level node declares a default.

Factories accept a second `NodeOptions` argument containing an optional `id`.
Metadata options remain generated and cannot be overridden by this argument.
Explicit IDs must be non-empty and unique in the current build. Weak references
tie nodes and handles to their original descriptors so reusing an ID in a later
build cannot reconnect an old reference to a different operation.

Host automatic IDs remain UUIDs. Sandbox automatic IDs remain readable names.
Those automatic IDs do not promise stable source identity across edits.
`workflowToDsl()` emits explicit graph IDs for known factories and custom-node
fallbacks. Canonical regeneration preserves executable data-edge graph
semantics, not arbitrary source text or editor layout.

The two DSLs retain their existing graph envelopes: host nodes use `data` and
execution flags, while sandbox nodes use kernel `properties`. The host runner
and CLI adapter convert the former. Sandbox list fan-in remains supported,
including single-output nodes in place of handles. Host nested connections
remain rejected. Neither path adds an execution engine.

## Capability classification

| Feature | Classification | Delivery |
|---|---|---|
| Implicit single-output connections and normalization | PURE TYPESCRIPT / RUNTIME DSL | Implemented |
| Explicit generated-factory IDs | PURE TYPESCRIPT / RUNTIME DSL | Implemented |
| Canonical regeneration with explicit IDs | PURE TYPESCRIPT / RUNTIME DSL | Implemented for existing exportable graph shapes |
| Typed workflow inputs and returned outputs | PURE TYPESCRIPT / RUNTIME DSL | Implemented |
| Callable workflow composition | PURE TYPESCRIPT / RUNTIME DSL | Implemented |
| Named output properties | PURE TYPESCRIPT / RUNTIME DSL | Implemented with reserved names and `node.outputs` |
| Runtime branches | REQUIRES EXPLICIT GRAPH CONSTRUCT | Implemented with If gates and isolated Subgraphs |
| Runtime iteration and streaming joins | REQUIRES EXPLICIT GRAPH CONSTRUCT | Map uses ForEach, Subgraph, and Collect with kernel correlation |
| Tagged template interpolation | REQUIRES EXPLICIT GRAPH CONSTRUCT | Implemented through Template dynamic inputs |
| Automatic stable source identity | REQUIRES COMPILER / AST SUPPORT FOR FULL EXPERIENCE | Deferred |
| Preserving arbitrary handwritten TypeScript across visual edits | REQUIRES COMPILER / AST SUPPORT FOR FULL EXPERIENCE | Outside canonical export guarantees |
| Converting ordinary `if` and `for` into runtime control flow | REQUIRES COMPILER / AST SUPPORT FOR FULL EXPERIENCE | Deferred |

## Existing boundaries

Typed schemas lower to existing scalar/media Input nodes. The new ValueInput
preserves optional, list, and arbitrary values, including null, without scalar
conversion. `.optional()` means nullable with a null fallback.
`.optional(value)` supplies a typed fallback. Named return fields lower to
Output nodes. Definitions are callable graph values recognized by the CLI.
Composition uses scoped Reroute nodes for its symbolic arguments and inlines
body operations. Explicit invocation scopes cannot be reused within a build.

The public authoring facade and lower-level core form an acyclic dependency.
The sandbox pack transforms the same authoring source rather than duplicating
helper implementations. Host and guest cores retain their existing envelopes.
Generated factories carry input modes and output correlation from metadata.
Canonical export preserves those fields and dynamic output declarations,
using low-level factories when generated defaults would change behavior.

`choose` builds isolated branch graphs. If gates every captured input and an
invocation gate, preventing untaken provider operations from running. A Code
node joins the selected output. Producers constructed outside callbacks remain
upstream dependencies. `map` builds a ForEach/Subgraph/Collect graph. Captures
are gated once per item with the item's correlation. Producer descriptor
identity distinguishes captures from nested scopes with identical local IDs.
Empty lists collect to empty lists. The existing actors govern ordering,
cancellation, errors, and concurrency. No helper adds a scheduler.

The agent `run_workflow` capability calls
`packages/execution/src/service/workflow-run.ts`. That service loads a saved
workflow, hydrates its graph, performs preflight checks, records a job, and
executes through `WorkflowRunner`. `validate_workflow` accepts inline graphs.
Transient graph execution should share the service path while omitting the
Workflow row. The existing host `runGraph()` helper is not that MCP capability.

Authored operation identity, run identity, and asset identity remain separate.
Graph source contains configuration and connections, not generated results.
Existing job, asset, spend, and provenance systems remain the execution boundary.

## Compiler and source-map proposal

Automatic IDs currently identify a build, not a stable source location. Full
source identity requires a compiler boundary with an explicit supported syntax:

1. A TypeScript AST pass identifies factory and composition call sites. A
   sidecar stores opaque authored operation IDs, module paths, source spans,
   and enclosing composition scopes. Existing explicit IDs take precedence.
2. An incremental matcher reuses identities across edits only when the old
   and new call sites match uniquely. Ambiguous matches allocate new IDs and
   report the ambiguity. Renaming a variable does not change identity. A loop
   index and a content hash do not become authored operation IDs.
3. The transform injects IDs into factory calls and composes instance scopes.
   Source maps associate the lowered branch/map nodes and kernel diagnostics
   with their authored expressions. Invocation and asset IDs remain separate.
4. Visual edits initially regenerate canonical source. An AST-preserving editor
   may patch only supported call expressions and connections with a unique
   sidecar match. Unsupported syntax and ambiguous edits fall back to canonical
   regeneration, with an explicit diagnostic.
5. Compiler tests must cover insertion, deletion, movement, renaming, duplicate
   expressions, module moves, nested composition, and source-span diagnostics.
   Compiler output must execute and export through the same graph path as the
   runtime DSL.

This proposal does not convert ordinary JavaScript control flow automatically.
That requires a further restricted syntax and compiler analysis. Arbitrary
handwritten TypeScript is outside the canonical export guarantee.

## Remaining service phase

P1.5 is separate from P1 and P2: expose `run_graph` for validated inline graphs
through the persisted execution service, retaining permission/cost gates, job
records, logs, cancellation, assets, and escalation while omitting the Workflow
row. Remote graph execution accepts graph data. Arbitrary TypeScript evaluation
requires its own sandbox compiler boundary.
