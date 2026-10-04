# App Runs, Instances and Run Observability — Design

**Status:** Draft, high level, for agreement before detailed design
**Related:** [media-generation-tracking-design.md](media-generation-tracking-design.md), [mini-apps.md](mini-apps.md), [error-tracing.md](error-tracing.md), [harnesses.md § Observing agent execution](harnesses.md#observing-agent-execution)

## 1. Summary

A mini app run is not a record today. The app's working state is one
localStorage entry per app per browser. A run overwrites the previous one, the
agent transcript disappears when the run ends, and nothing links a generation
to the run that made it.

Observability has the same gap. The server emits OpenTelemetry spans for
workflows, agents and LLM calls, but only to a file, stdout or a collector, and
only when one of them is configured. Nobody inside the product can read those
spans. The UI builds its own trace from WebSocket messages and loses it on
reload. Agents read a third shape: the `job.logs` tail and the `debug_app`
verdict. The browser half of an app run, and the agent loops inside
capabilities, emit no spans at all.

This design adds four things, in this order:

1. An **app instance**: a named, server-side working copy of an app.
2. An **app run**: a durable record of one operation invocation, opened before
   the work starts and closed with its outcome.
3. A **run trace**: every span and log line from the run, written by the server,
   the browser and the agent loops into one store.
4. **Three readers of that store**: the person in the UI, agents through tools
   and the CLI, and external OTel collectors. All three read the same records.

Generations made during a run attach to that run, and their assets stay in the
library.

## 2. Problems this solves

| Gap | Evidence today |
|---|---|
| No history | `application_invocations` is a billing ledger: operation, cost, status. Example-app script runs do not write it. |
| One state per app | Variables persist under `nodetool.app.variables.<app identity>` in localStorage. Electron and Chrome already hold different states for the same example. |
| Generations not linked | `nodetool_generation_attachments` exists but is empty. No generation names the app run that made it. |
| Tracing off by default | `server.ts` calls `initTelemetry()` with no options. With no sink variable set, the tracer stays null and every `withSpan` is a pass-through. A normal desktop session records no spans. |
| Three trace shapes | OTel spans go to external sinks. `TraceStore` folds WebSocket messages into at most 10 in-memory runs. `get_job_logs` reads the `job.logs` JSON column. The three disagree on names, scope and lifetime. |
| Browser half invisible | Parameter resolution, the message fold, variable writes and widget errors run in the browser with no spans. The browser bundle excludes the OTel SDK on purpose. In-browser workflow runs have no spans either. |
| Agent loops invisible | `provider.generateLoop` and capability calls open no span. `AgentActivityReporter` sends `chunk` and `tool_call_update` messages that the widget shows only while the run lasts. |
| Agents cannot read runs | No tool reads spans. An agent sees `get_job_logs`, `debug_app` and error traces, and nothing for app runs or chat turns. It cannot diagnose a run that a person started. |
| Logs unusable | One 920 MB server log, with no run scoping. |

## 3. Concepts

```
App (document, versioned)
 └── App instance  "Spring sale", "Run B"        ← user-owned, named, pinned to an app version
      ├── state: variables
      └── App run  (one per operation invocation)
           ├── inputs snapshot, outputs, status, error, timing, cost
           ├── trace: spans + log events (server, browser, agent loops)
           ├── generations (attached, assets kept)
           └── produced documents (storyboards, timelines, …) by reference
```

- **App instance.** The unit of history and comparison. It holds the variable
  state that localStorage holds today. It pins the app version it started on.
  The user can create, rename, duplicate and delete instances.
- **App run.** One invocation of one operation inside one instance. It is the
  app counterpart of a workflow job. Child work keeps its own records: a
  workflow job, a generation, an agent loop. The run references them.
- **Run trace.** An OpenTelemetry-shaped span tree with one trace id per run.
  Log lines are span events, so the Logs view and the Trace view read the same
  data. The record shape is the existing `TraceRecord` from
  `packages/runtime/src/trace-exporters.ts`.
- **Run.** The general term for anything with a run trace: an app run, a
  workflow job or a chat turn. The read surface in [4.9](#49-agent-read-surface)
  works on runs, not only on app runs.

Writers and readers of a run trace:

| Writer | Spans it adds |
|---|---|
| Server | `app.run`, `script.run`, `workflow.run`, `node.process`, `capability.call`, `generation`, `llm.*`, IO and CPU task spans |
| Browser | `ui.action`, `ui.resolve_params`, `ui.fold`, `ui.widget_error`, and in-browser `workflow.run` and `node.process` |
| Agent loops | `agent.loop`, `agent.round`, `tool.call`, and the existing `agent.execute`, `agent.plan`, `agent.step` |

| Reader | Surface | What it needs |
|---|---|---|
| Person in the UI | Trace and Logs views, AgentActivity widget, run history | Live updates, a readable tree, a link from an error to its span |
| In-product agent | `runs` capabilities | A summary first, then bounded drill-down by span |
| Coding agent | `nodetool.runs.*` through MCP `execute_code`, and `nodetool runs` | The same, with JSON output and a follow mode |
| External collector | OTLP, JSONL file, stdout sinks | Standard OTel spans, as today |

## 4. Design

### 4.1 Run context propagation

The server creates the app run before any work starts. It puts a **run context**
on the `ProcessingContext`: the instance id, the app run id and the trace id.
Every child reads that context instead of taking new parameters. Children are a
script run, a capability call, a workflow job, an agent loop, a provider call
and a generation. `ProcessingContext.copy()` already shares the variable bag,
so the budget and the permission gate travel this way today.

Consequences:

- A generation attaches itself to the run from the context, with
  `target_type: "app_run"`. Nothing in the operation has to remember to attach it.
- Every span opened under the context gets the run's trace id. So an agent
  round deep inside `finish_storyboard` lands in the right tree.
- A run started from the browser carries a W3C `traceparent` header.
  `http-tracing.ts` already continues an incoming `traceparent`, so the
  server's `app.run` span becomes a child of the browser's `ui.action` span.
  A run started by an agent, the CLI or `debug_app` has `app.run` as its root.

### 4.2 App run record

The record opens before the operation runs and closes with a terminal status,
the same rule that generation tracking follows. It holds:

- the instance id, the operation id and the app version
- the origin: `ui`, `agent`, `cli` or `debug`
- an input snapshot: the resolved operation inputs
- the outputs written to variables, and the documents created or changed
- status (`running`, `completed`, `failed`, `cancelled`), error, start and end
  times, and cost (summed from child generations and LLM calls)
- the trace id and the root span id

`application_invocations` either becomes this table or a view over it. The
billing fields stay correct either way.

### 4.3 Generations and assets

Generations already have a durable lifecycle. This design adds only the
attachment to the app run. Deleting an instance or a run never deletes an asset
or a generation record. It removes the attachment. The library stays the owner
of media.

### 4.4 Execution path

App operations run on the server whenever they can, so the server owns the
record and the trace. An in-browser run (the in-browser workflow path) opens the
app run through the API and reports its spans to the same store, as
[4.7](#47-browser-spans) describes. That keeps one record shape for both paths.

### 4.5 One trace store, three readers

- **The run store is the source of truth.** A span processor writes spans to a
  per-run table in the database. The UI and agents read only this table. The
  file, stdout and OTLP sinks stay as copies for external tools.
- **Recording is always on.** `initTelemetry` registers the run-store processor
  even when no external sink is configured. External sinks stay opt-in.
- **Only run spans are kept.** Opening a run registers its trace id. The
  processor keeps spans whose trace id is registered and drops the rest, so
  `/api/assets` request spans never reach the table.
- **Live and stored data have one shape.** The processor publishes span starts,
  span ends and events for a run over the existing WebSocket. A finished run
  reloads from the table. The Trace panel renders the same records live and
  after a reload.
- **WebSocket processing messages keep their job.** `node_update`, `chunk` and
  `output_update` still drive widget state. They stop being the input of the
  Trace panel. `TraceStore` becomes a client cache of run-store records.

### 4.6 Server spans

- **One root per run.** An app run opens `app.run`. A workflow job keeps
  `workflow.run`. A chat turn opens `chat.turn`, with the thread id as an
  attribute.
- **New children** for the script (`script.run`), each capability call
  (`capability.call`, with the capability name), each generation and each
  render.
- **Log lines become span events.** Script `console` output, node logs and
  warnings carry a level and a source. A `createLogger` call inside an active
  span also adds an event to that span, so server logs are scoped to a run.

### 4.7 Browser spans

The app runtime and the in-browser workflow runner record spans in the same
`TraceRecord` shape. They use a small recorder in `web/src/lib/`, not the OTel
web SDK. The recorder creates ids, nests spans, and batches finished spans to
`POST /api/runs/:id/spans` (or over the WebSocket).

| Span | Records |
|---|---|
| `ui.action` | The user action that started the run: the widget, the operation, the instance |
| `ui.resolve_params` | Each input's mapping source and the resolved value preview, and any missing binding |
| `ui.fold` | Messages folded into state, and each variable write |
| `ui.widget_error` | A widget that threw while rendering run output, with the component and the error |
| `workflow.run`, `node.process` | In-browser kernel runs, with the same names as on the server |

The server accepts browser spans only for runs that the caller owns and that
are open or closed within the last few minutes. It applies the caps and
redaction in [4.10](#410-content-and-retention-policy). Error traces from the
web and Electron error boundaries gain `trace_id` and `app_run_id` in
`ERROR_TRACE_CONTEXT_KEYS`, so a crash links to its run.

### 4.8 Agent spans

- **Agent loops get spans.** `provider.generateLoop` opens `agent.loop`, with
  one `agent.round` per round. Each tool call opens `tool.call`, with the tool
  name, an argument summary, a result summary and an error status on failure.
- **AgentActivity reads the trace.** `AgentActivityReporter` keeps its live
  messages and also writes its text and tool results as span events. The
  widget renders the stored events for a finished or reloaded run.
- **LLM content is recorded.** Today `llm.chat` records the response cut at
  2,000 characters, `llm.stream` records only the chunk count, and both record
  only the message and tool counts of the request. Both spans also record the
  request messages, the tool names and the response, under the caps in
  [4.10](#410-content-and-retention-policy). An agent that diagnoses a prompt
  problem needs both sides of the call.

### 4.9 Agent read surface

One service in `@nodetool-ai/execution` answers every reader. The tRPC router,
a new `runs` capability module and the CLI call it, the same pattern as
`mcp-tools.ts`. Chat and MCP clients reach the capabilities as
`nodetool.runs.*` inside `execute_code`. So the answer an agent gets cannot
differ from what the panel shows.

| Capability | CLI | Returns |
|---|---|---|
| `list_runs` | `nodetool runs list` | Runs filtered by kind, app, instance, workflow, thread, status, origin and time |
| `get_run` | `nodetool runs show <id>` | The record and a summary: status, error, the path from the root to the first failed span, cost by provider, the slowest spans, counts by span name, attached generations and documents |
| `get_run_trace` | `nodetool runs trace <id>` | The span tree, with a depth limit, a focus span, a name filter and an errors-only mode. Attributes are cut to a fixed length unless the caller names the span. |
| `get_run_logs` | `nodetool runs logs <id>` | Span events filtered by level, source and span, newest last |
| `await_run` | `nodetool runs tail <id>` | Waits for a terminal status. `tail` streams spans and events as they happen. |

- **Summary first.** `get_run` fits in a small token budget. An agent drills
  down with `get_run_trace` on the span ids the summary names.
- **IDs follow the resource ID principles.** A run id is accepted in full or as
  its 12-character prefix. Trace ids and span ids are OTel ids and are returned
  verbatim, never shortened.
- **Agents and people share runs.** `debug_app` creates a real app run with
  origin `debug` and returns its id, so the person sees the agent's test runs in
  history. An agent reads a run that a person started with the same tools.
- **`get_job_logs` reads the run store** for jobs that have a trace, and falls
  back to `job.logs` for older jobs.
- **The troubleshooter skill starts from `get_run`.** The skill names the run
  tools as its first step for app runs, workflow jobs and chat turns.

### 4.10 Content and retention policy

Run traces hold user data: prompts, responses, inputs and console output. Error
traces deliberately store none of that. Run traces need it to be useful.

- **Owner-scoped.** Every read checks the run's owner, as error traces do. On
  Supabase, the table gets row-level security with an owner-read policy.
- **Redacted.** The credential rules of `redactErrorTrace` run on every
  attribute and event before insert. Prompts and responses are kept.
- **Capped.** Attribute strings stop at a fixed length. A run stops storing new
  spans after a span cap and new events after an event cap, and the root span
  records that it was truncated. Readers report the truncation.
- **No media bytes.** Images, audio and video appear as asset ids or
  generation ids, never as inline data.
- **In the personal-data registry.** Account export includes run traces, and
  account erasure deletes them.
- **Pruned.** Span detail is pruned after a configurable age. The run record
  and its summary stay ([D8](#5-decisions-to-agree)).

### 4.11 User experience

**In the app**

- An instance switcher in the app header: the current instance name, a list of
  instances, "New instance" and "Duplicate".
- A history list for the current instance: operation, time, status, cost,
  origin and a result thumbnail. Selecting a run shows its inputs and outputs
  read-only. It also links to the documents it made and to "View trace".
- Comparison: each instance opens as its own workspace tab, so two instances
  sit side by side. A dedicated diff view waits until tabs prove insufficient.
- The AgentActivity widget reads the run's stored trace, so a finished or
  reloaded run still shows the agent's work.

**In the bottom panel**

- One run picker drives two views. There is no separate App Log panel.
  - **Trace:** the span tree with a timeline, duration, cost and status per
    span. Browser spans show in their own lane above the server spans.
  - **Logs:** a flat, filterable list (level, source, span) of the same run.
- The picker lists recent app runs, workflow jobs and chat turns, from the
  store, so the list survives a reload.
- An error or "View trace" link in an app opens the panel on the failed span.
- **"Ask the agent"** on a run or a span opens chat with the run id and the span
  id. The agent starts from `get_run` with no copy and paste.

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
| D9 | Recording default | The run store records always. External sinks stay opt-in. |
| D10 | Trace panel input | Run-store records, live over the WebSocket. `TraceStore` stops folding processing messages. |
| D11 | Browser instrumentation | A small in-house recorder that emits `TraceRecord`, with W3C `traceparent` to the server. No OTel web SDK in the bundle. |
| D12 | Content in run traces | Store prompts, responses, inputs and console output, capped, redacted and owner-scoped. Error traces keep their no-content rule. |
| D13 | Agent read surface | One runs service behind tRPC, the `runs` capability module and the CLI. Summary first, drill-down by span. |
| D14 | `debug_app` runs | Create real app runs with origin `debug`, visible in history. |

## 6. Phases

1. **Run record and context.** App instance and app run tables, the API, and
   run-context propagation. Generations attach to app runs. The app reads and
   writes instance state on the server.
2. **Server trace store.** The always-on run-store processor, the root spans,
   spans on the script path, capability calls, agent loops and tool calls, and
   log lines as span events.
3. **Agent read surface.** The runs service, the five capabilities, the
   `nodetool runs` commands and the tRPC router. `debug_app` writes app runs.
   `get_job_logs` reads the store. This phase comes before the UI, because the
   UI reads the same service and the harness checks need it first.
4. **UI trace.** The browser recorder, the Trace and Logs views on the store,
   live streaming, AgentActivity on stored events, "View trace" and
   "Ask the agent".
5. **History and instances UX.** The instance switcher, the run history list,
   the read-only run view, and side-by-side tabs.

Each phase ships with a harness check, in the spirit of
[Harness-First Engineering](HARNESS_FIRST.md):

| Phase | Check |
|---|---|
| 1 | A scripted app run whose record and generation attachment a test reads back |
| 2 | The same run with no external sink configured, whose stored tree has `app.run`, `script.run`, a `capability.call` and an `llm.*` span under one trace id |
| 3 | `nodetool runs show <id> --json` on that run names the failed span of a run built to fail |
| 4 | A browser run whose stored trace has `ui.action` as the parent of `app.run` |
| 5 | Two instances of one app, each with its own variables and history |

## 7. Out of scope for now

- A diff view between two instances.
- Sharing instances or runs with other users.
- Exporting a run as a bundle.
- Spans for UI work that is not part of a run, such as canvas edits or
  navigation.
