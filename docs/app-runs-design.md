# App Runs, Instances and Run Observability — Design

**Status:** Draft, high level, for agreement before detailed design
**Related:** [media-generation-tracking-design.md](media-generation-tracking-design.md), [mini-apps.md](mini-apps.md), [harnesses.md § Observing agent execution](harnesses.md#observing-agent-execution)

## 1. Summary

A mini app run is not a record today. The app's working state is one
localStorage entry per app per browser. A run overwrites the previous one, the
agent transcript disappears when the run ends, and nothing links a generation
to the run that made it. The server traces workflows, agents and LLM calls,
but it writes the spans only to a file or a collector. The script path that most
app operations use has no root span, and the UI never sees any server spans.

This design adds three things, in this order:

1. An **app instance**: a named, server-side working copy of an app.
2. An **app run**: a durable record of one operation invocation, opened before
   the work starts and closed with its outcome.
3. A **run trace**: every span and log line from the run, stored per run and
   streamed live, shown in one bottom panel with a Trace view and a Logs view.

Generations made during a run attach to that run, and their assets stay in the
library.

## 2. Problems this solves

| Gap | Evidence today |
|---|---|
| No history | `application_invocations` is a billing ledger: operation, cost, status. Example-app script runs do not write it. |
| One state per app | Variables persist under `nodetool.app.variables.<app identity>` in localStorage. Electron and Chrome already hold different states for the same example. |
| Generations not linked | `nodetool_generation_attachments` exists but is empty. No generation names the app run that made it. |
| No end-to-end trace | Spans exist for `workflow.run`, `node.process`, `agent.*` and `llm.*`, exported only to file, stdout or OTLP. The JS script run path has no span. The Trace panel reads workflow WebSocket updates keyed by workflow id. |
| Transcript lost | The AgentActivity widget shows the agent's work only while the operation runs. |
| Logs unusable | One 920 MB server log, with no run scoping. |

## 3. Concepts

```
App (document, versioned)
 └── App instance  "Spring sale", "Run B"        ← user-owned, named, pinned to an app version
      ├── state: variables
      └── App run  (one per operation invocation)
           ├── inputs snapshot, outputs, status, error, timing, cost
           ├── trace: spans + log events
           ├── generations (attached, assets kept)
           └── produced documents (storyboards, timelines, …) by reference
```

- **App instance.** The unit of history and comparison. It holds the variable
  state that localStorage holds today. It pins the app version it started on.
  The user can create, rename, duplicate and delete instances.
- **App run.** One invocation of one operation inside one instance. It is the
  app counterpart of a workflow job. Child work keeps its own records: a
  workflow job, a generation, an agent loop. The run references them.
- **Run trace.** An OpenTelemetry-shaped span tree with one root span per app
  run. Log lines are span events, so the Logs view and the Trace view read the
  same data.

## 4. Design

### 4.1 Run context propagation

The server creates the app run before any work starts. It puts a **run context**
on the `ProcessingContext`: the instance id, the app run id and the trace id.
Every child reads that context instead of taking new parameters. Children are a
script run, a capability call, a workflow job, an agent loop, a provider call
and a generation. `ProcessingContext.copy()` already shares the variable bag,
so the budget and the permission gate travel this way today.

Two consequences:

- A generation attaches itself to the run from the context, with
  `target_type: "app_run"`. Nothing in the operation has to remember to attach it.
- Every span opened under the context gets the run's trace id. So an agent
  round deep inside `finish_storyboard` lands in the right tree.

### 4.2 Trace capture and storage

- **One root span per app run** (`app.run`), with children for the script,
  each capability call, each workflow job, each agent round, each LLM call,
  each render and each generation.
- **A span processor writes spans to a per-run store** in the database, beside
  the existing file and OTLP sinks. It uses the same OTel data, so the UI and
  external collectors cannot disagree.
- **Script `console` output, node logs and warnings become span events.** They
  carry a level and a source.
- **Live streaming:** the server pushes span starts, ends and events for a run
  over the existing WebSocket. A finished run reloads from the store.
- **The same mechanism serves workflow jobs and chat turns.** Their root spans
  are `workflow.run` and the chat turn, so the panel is not app-specific.

### 4.3 App run record

The record opens before the operation runs and closes with a terminal status,
the same rule that generation tracking follows. It holds:

- the instance id, the operation id and the app version
- an input snapshot: the resolved operation inputs
- the outputs written to variables, and the documents created or changed
- status (`running`, `completed`, `failed`, `cancelled`), error, start and end
  times, and cost (summed from child generations and LLM calls)
- the trace root id

`application_invocations` either becomes this table or a view over it. The
billing fields stay correct either way.

### 4.4 Generations and assets

Generations already have a durable lifecycle. This design adds only the
attachment to the app run. Deleting an instance or a run never deletes an asset
or a generation record. It removes the attachment. The library stays the owner
of media.

### 4.5 Execution path

App operations run on the server whenever they can, so the server owns the
record and the trace. An in-browser run (the in-browser workflow path) opens the
app run through the API and reports its spans to the same store. That keeps one
record shape for both paths.

### 4.6 User experience

**In the app**

- An instance switcher in the app header: the current instance name, a list of
  instances, "New instance" and "Duplicate".
- A history list for the current instance: operation, time, status, cost and a
  result thumbnail. Selecting a run shows its inputs and outputs read-only. It
  also links to the documents it made and to "View trace".
- Comparison: each instance opens as its own workspace tab, so two instances
  sit side by side. A dedicated diff view waits until tabs prove insufficient.
- The AgentActivity widget reads the run's stored trace, so a finished or
  reloaded run still shows the agent's work.

**In the bottom panel**

- One run picker drives two views. There is no separate App Log panel.
  - **Trace:** the span tree with a timeline, duration, cost and status per span.
  - **Logs:** a flat, filterable list (level, source, span) of the same run.
- The picker lists recent app runs, workflow jobs and chat turns. An error or
  "View trace" link in an app opens the panel on that run.

## 5. Decisions to agree

| Code | Decision | Recommendation |
|---|---|---|
| D1 | Where instance state lives | Server document. localStorage becomes a cache only. |
| D2 | Instance and app version | An instance pins the app version it started on. A new run can move it to the latest version. |
| D3 | Separate App Log panel | No. One run picker, with Trace and Logs views of the same data. |
| D4 | Trace store | A per-run span table fed by an OTel span processor, not a second tracing API. |
| D5 | Execution location | Server by default. In-browser runs report through the same API. |
| D6 | `application_invocations` | Fold into the app run record. Keep billing correct. |
| D7 | Deletion | Deleting an instance or run keeps assets and generation records. |
| D8 | Retention | Keep run records indefinitely. Prune span detail after a configurable age, and keep the run summary. |

## 6. Phases

1. **Run record and context.** App instance and app run tables, the API, and
   run-context propagation. Generations attach to app runs. The app reads and
   writes instance state on the server.
2. **Trace capture.** The root span on the app run, spans on the script path and
   capability calls, the per-run span store, and log lines as span events.
3. **Trace and Logs views.** The run picker, the span tree and timeline, the logs
   list, live streaming, and "View trace" links from apps.
4. **History and instances UX.** The instance switcher, the run history list, the
   read-only run view, and side-by-side tabs.

Each phase ships with a harness check: a scripted app run whose record, trace
and attachments a test reads back, in the spirit of
[Harness-First Engineering](HARNESS_FIRST.md).

## 7. Out of scope for now

- A diff view between two instances.
- Sharing instances or runs with other users.
- Exporting a run as a bundle.
