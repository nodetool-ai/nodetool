# @nodetool-ai/app-runtime

The runtime core for NodeTool mini apps, with no framework and no dependencies.
A mini app is a UI document plus typed bindings to workflow operations — all
computation stays in the graph, so the only semantics this layer owns are
document parsing, binding resolution, instance state, the streaming fold, run
policy, conditions, and the widget catalog.

Four hosts run those semantics: the web runtime, the mobile app, the
`nodetool app debug` harness, and the eval suites. They share this package so
they cannot drift. `src/fold.ts` is here because three of them once folded a
run's messages their own way and disagreed about what an app was showing.

## Modules

| Module | Owns |
| --- | --- |
| `document.ts` | The `ApplicationDocument` schema and its parser, including lifting legacy `workflow.app_doc` v1–v3 |
| `bindings.ts` | The binding token (`op:<id>/out:<nodeId>`, `var:<id>`, …), its parser, and the state key it resolves to |
| `state.ts` | `AppInstanceState`, its four value namespaces, and the pure reducer over `AppStateEvent` |
| `fold.ts` | Turning a run's `ProcessingMessage`s into state events |
| `operations.ts` | Resolving an operation binding into the name-keyed `params` a run wants |
| `policy.ts` | What to do when an operation is asked to run while already running |
| `conditions.ts` | `visibleWhen` / `disabledWhen` evaluation and `format` templates |
| `actions.ts` | The six-verb action vocabulary a widget event dispatches |
| `widgets.ts` | The widget catalog — one table behind the Puck editor config, the harness, and the `app-tools` eval |
| `doc-ops.ts` | Immutable edits to the non-UI half of a document (operations, variables, resources) |
| `bundle.ts` | The `ApplicationBundle`: an app plus the full graphs it binds, as one JSON artifact |
| `script-run.ts` | The contract for an operation that runs a JS script instead of a workflow |
| `chat.ts` | Reading a bound value as a conversation, for the thread and composer widgets |
| `documents.ts` | Unwrapping sketch and timeline refs out of a bound value |

## Usage

Everything is a pure function, so a host drives the reducer itself. Folding a
run's messages into the state an app displays:

```ts
import {
  applyEvents,
  createInstanceState,
  messagesToEvents,
  type InvocationState
} from "@nodetool-ai/app-runtime";

const invocation: InvocationState = {
  id: "job-1",
  operationId: "main",
  status: "running",
  startedAt: Date.now()
};

let state = applyEvents(createInstanceState(), [
  { type: "runStarted", invocation, outputKeys: ["main:out"] }
]);

state = applyEvents(
  state,
  messagesToEvents(
    [
      { type: "chunk", job_id: "job-1", node_id: "out", content: "Hello " },
      { type: "chunk", job_id: "job-1", node_id: "out", content: "world", done: true },
      { type: "chunk", job_id: "other-job", node_id: "out", content: "!" }
    ],
    {
      resolveInvocation: (jobId) => state.invocations[jobId ?? ""] ?? null,
      outputKey: (opId, nodeId) => `${opId}:${nodeId}`
    }
  )
);

state.outputs["main:out"];
// { value: "Hello world", invocationId: "job-1", status: "done", revision: 3 }
```

Two rules that example pins. Text chunks concatenate rather than giving the
slot one value per token. And the message stamped `other-job` is dropped:
matching on `job_id` is what stops a second tab, an overlapping run, or a run
started in the graph editor from writing into this app's values.

## No dependencies, on purpose

`dependencies` is empty and stays empty. The Puck document and the workflow
graph are typed structurally here rather than imported from `@puckeditor/core`
and `@nodetool-ai/protocol`, so the package loads in a browser bundle, in a
Node harness, and in React Native without dragging a server-side tree behind
it. Mobile compiles it from **source** — wired in `mobile/metro.config.js`,
`mobile/tsconfig.json`, and `mobile/jest.config.js`, all three of which must
agree.

## Develop

```bash
npm run build --workspace=packages/app-runtime
npm run test  --workspace=packages/app-runtime
npm run lint  --workspace=packages/app-runtime   # tsc --noEmit
```

What a mini app is: [docs/mini-apps.md](../../docs/mini-apps.md). Every widget,
binding, action, and condition in tables:
[docs/mini-apps-reference.md](../../docs/mini-apps-reference.md). Building one:
[docs/mini-apps-guide.md](../../docs/mini-apps-guide.md). The headless harness
that drives this package: `nodetool app debug`, in
[docs/cli.md](../../docs/cli.md).
