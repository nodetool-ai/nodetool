# Runtime core

Execution contracts, cancellable runs, the shared workspace implementation,
URL egress policy and an OpenAI-compatible text streaming adapter. This package
does not load media codecs, browser automation or local inference.

Install `@nodetool-ai/runtime-core` to use `OpenAITextProvider`,
`createLocalWorkspace` and `RunCancellation`. Hosts supply the authenticated
owner, secret resolver and usage accounting through `ExecutionContext`.

## Node context contract

`NodeContext` (`src/node-context.ts`) lists the context members node code may
use, with their signatures, grouped by concern. `ProcessingContext` in
`@nodetool-ai/runtime` implements `NodeContext<RuntimeNodeContextTypes>`, so the
compiler checks the TypeScript side. Types this package cannot import, such as
`BaseProvider` and `Message`, are slots in `NodeContextTypes` that the runtime
binds. Unbound, they are `unknown`. The persistence port the context forwards
to (`ProcessingContextModelInterfaces` and its record types) lives in
`src/model-interfaces.ts`.

`node-context-members.json` is generated from the interface. The native
runner's guest context is tested against it (see
[the graph-runner README](../../native/graph-runner/README.md#node-context-contract)).

To add a member that node code needs:

1. Add it to the matching group interface in `src/node-context.ts`, with the
   signature `ProcessingContext` has.
2. Run `node packages/runtime-core/scripts/node-context-members.mjs` from the
   repository root to regenerate the JSON.
3. Implement it in the guest context, or declare it in
   `native/graph-runner/guest/context-unavailable.mjs` with a reason.

`npm run check:node-context --workspace=packages/runtime-core` fails when the
JSON is stale, or when node code uses a `ProcessingContext` member the
interface lacks. The second check reads the built declarations, so run
`npm run build:packages` first. Without `--check`,
`node packages/runtime-core/scripts/node-context-usage.mjs` prints each member
with its call sites and packages.

### Shared context logic

Member logic that does not depend on the host lives in modules that both
`ProcessingContext` and the native runner's guest context call, so the two do
not keep separate copies:

| Module | Members |
|---|---|
| `src/cost-ledger.ts` (`@nodetool-ai/runtime-core/cost-ledger`) | `addToTotalCost`, `getTotalCost` |
| `packages/runtime/src/node-context/message-media.ts` | `resolveMessageMediaUris` |
| `packages/runtime/src/node-context/provider-dispatch.ts` | `providerSupportsStreamingTTS`, the provider call of each capability |
| `packages/runtime/src/node-context/generation.ts` | `runGeneration`, `runProviderPrediction`, `streamProviderPrediction`, `textToSpeechEncoded`, `textToMusic`, `audioToAudio` |

A module goes in this package when it needs only types from here. The
modules in `packages/runtime/src/node-context/` use runtime types such as
`BaseProvider` and `Message`. Every one of them must load in QuickJS: no Node
builtins, no file system, no `process` and no side effects at load time.

Each function takes a host as its first argument.
`packages/runtime/src/node-context/context-host.ts` defines the host
interfaces: `MediaHost` (stored bytes and entity lookups), `ProviderHost`,
`ProviderCallHost` (media, the run signal and message resolution) and
`GenerationHost` (the run, its lifecycle callbacks, the registry of live
generations and the app-run flag). `ProcessingContext` passes itself, or for
the generation envelope an adapter over its private lifecycle state, and its
methods delegate. The guest context passes its own context, whose primitives
reach the C++ host. To move another member's logic into a shared module, add
the primitives it needs to the matching host interface and implement them on
both sides.
