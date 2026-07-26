---
layout: page
title: "Mini Apps"
description: "What Mini Apps are, where they live, and how the app document, bindings, and runtime fit together."
---

A Mini App is a face over one or more workflows. The graphs stay where they are;
the app puts a form in front of them, runs them on a click or a change, and
streams the outputs back into widgets. Nobody using the app sees a node.

An app is its own resource, not a mode of a workflow. It has an id, a name, a
version history, releases, and a spend budget, none of which belong on a graph.
You create one from the **Apps** panel in the left sidebar and open it as its own
workspace tab. Workflows the app binds are listed under **Linked workflows** on
that tab and open as ordinary workflow tabs when you ask for them.

- **[Building Mini Apps](mini-apps-guide.md)** — recipes for nine app shapes,
  each built step by step.
- **[Mini App Reference](mini-apps-reference.md)** — widgets, binding tokens,
  actions, conditions, format filters, and the document schema.
- **[App Builder](app-builder.md)** — the editor itself.

## What Mini Apps are for

A workflow graph is the right surface for the person building the pipeline and
the wrong one for everyone else. The graph exposes model choices, retry paths,
and intermediate nodes that a person who just wants a caption written does not
need and should not be able to break. A Mini App narrows that surface to the
three fields that actually vary.

Concretely, apps solve these:

| Problem | What the app does |
| --- | --- |
| A teammate needs to run your workflow but not edit it | Inputs bound to Input nodes, one Run button. The graph is not reachable from the app. |
| The workflow has 40 nodes and 3 things worth changing | Only those 3 get widgets. Everything else stays fixed in the graph. |
| A run takes 90 seconds and looks frozen | Bind a Progress widget and an activity label to the operation's execution state. |
| The result is a stream, not a value | Display widgets accumulate streamed chunks; text concatenates, structured items collect into a list. |
| One screen drives several workflows | Declare an operation per workflow. Each has its own inputs, outputs, state, and Run button. |
| A step needs review before the next one | Operation A writes an app variable, a widget shows it, a second button runs operation B reading that variable. |
| A parameter should re-run the workflow as you drag it | A slider bound to a node property with a `change` event and `release` pacing. |
| The same tool is used daily with the same settings | A user-scoped variable with `persist: true` remembers the setting across sessions. |

When **not** to build one: a workflow you run once, a pipeline driven by another
program (use the [Workflow API](workflow-api.md)), or an open-ended task with no
fixed shape (use [Chat](global-chat.md) instead).

## Where apps live

Each app is a row in the `applications` table: name, description, project, and
the `ApplicationDocument` it renders. Nothing about an app is stored on a
workflow, and opening a workflow never produces an app.

| Surface | How to get there |
| --- | --- |
| Apps panel | Left sidebar → **Apps**. Every app you own, plus **New app** and **New app from workflow**. |
| App tab | Click an app in the panel. One workspace tab per app, with **Design**, **Run**, and **Settings**. |
| Linked workflows | The menu on the app tab. Lists the workflows the app's operations bind; clicking one opens a workflow tab. |
| Headless | `nodetool app debug <application_id>`. See [Debugging an app](#debugging-an-app). |

Apps run wherever their workflows run: the desktop app, a self-hosted server, or
NodeTool Cloud. Mobile opens a published app as its own screen, one app per
screen.

### Creating an app

Two ways, both deliberate:

- **New app** starts from an empty document. Add an operation, pick the workflow
  it runs, place widgets.
- **New app from workflow** scaffolds a document whose single operation is bound
  to the workflow you picked, with a widget per Input and Output node. It is a
  one-way copy: the app is a separate resource from that moment on, and editing
  either side does not touch the other.

There is no automatic app. A workflow without an app is just a workflow.

### Publishing and sharing

**Publish** snapshots the document as a version and pins the graph of every
workflow the app binds, so a released app keeps running the graphs it was
released with while you go on editing the drafts. Budgets cap what a published
app may spend, and each run is metered against them.

An **ApplicationBundle** is the portable form: one JSON document carrying the app
plus the full graph of every workflow it binds. Export a bundle, hand it over,
import it, and the recipient gets a working app together with its workflows.
Inside the bundle each operation names a bundle-local workflow key, and import
rewrites those keys to the ids of the workflows it creates. Shipped example apps
are bundles installed through the same path.

## How a Mini App works

Four pieces, and only one of them computes.

```
ApplicationDocument            (what you author)
  ui           Puck layout, widgets, bindings
  operations   named workflow bindings + input/output mappings
  variables    declared app state slots
  resources    typed handles to assets, timelines, storyboards, sketches
        │
        │  bindings resolve against the live graphs
        ▼
AppInstanceState               (what one open app holds)
  inputs · outputs · variables · view · invocations
        │
        │  streaming fold: run messages → state events
        ▼
Workflow runs                  (where all the logic lives)
```

The document is configuration. Nothing in it branches, loops, or calls a
provider; that is the graph's job. This is deliberate: logic in the graph is
testable, cacheable, and visible to the agent, and logic in the app layer is
none of those.

### The app document

The `document` column of an application row holds an `ApplicationDocument`, four
collections plus a schema version (currently 3):

- **`ui`** — the Puck layout: which widgets are placed where, and what each one
  is bound to.
- **`operations`** — named bindings to workflows. An operation has an id, a
  workflow id, an optional pinned version, per-input and per-output mappings, a
  concurrency policy, and an optional timeout. One app can bind several
  workflows, and the same workflow twice with different mappings
  (`translateTitle`, `translateBody`).
- **`variables`** — declared app state slots, each with a type, a default, a
  scope (`instance` or `user`), and whether it persists.
- **`resources`** — typed handles to an asset, timeline, storyboard, or sketch,
  scoped to a project or pinned to one document, with the operations the app may
  perform on it.

Operations are what make an app more than a form over one graph. A transcribe
app can bind a transcription workflow, a summarizer, and a translator, and drive
all three from one screen.

### Bindings

A binding is the string that connects one widget to one slot of app state. It
travels through the document as a single token:

```
op:<opId>/in:<nodeId>            an operation input
op:<opId>/out:<nodeId>           an operation output
op:<opId>/prop:<nodeId>#<prop>   a node property driven by a widget
op:<opId>/exec#<field>           running | progress | error | activity
var:<variableId>                 a declared app variable
view:<componentId>#<prop>        widget-local state, never persisted
```

Bindings carry the operation id, so two operations that share a workflow never
read each other's values. They key on node **IDs**, not names, so renaming an
Input node in the graph editor cannot break an app. Names are still accepted and
resolved against the live graph, which is how older documents keep working; the
editor rewrites them to the ID form when it can and reports the ones it cannot.

How a bare name resolves depends on how the widget uses it. A write widget looks
for an Input node, a read widget looks for an Output node and then a variable,
and a condition or `format` token tries outputs, then inputs, then variables.

A binding that resolves to nothing is a validation error, not a silent no-op.
Both App Builder and `nodetool app debug` report it.

### Instance state

One open app holds one `AppInstanceState`, split into five namespaces so nothing
collides:

| Namespace | Key | Holds |
| --- | --- | --- |
| `inputs` | `opId:nodeId` | Current input values, plus whether a widget (rather than a default) wrote them. |
| `outputs` | `opId:nodeId` | Streamed output values with their status: `empty`, `pending`, `streaming`, `done`. |
| `variables` | variable id | Declared app state. |
| `view` | `componentId:prop` | Widget-local state. Never persisted. |
| `invocations` | job id | Status, progress, error, and activity label per run. |

Keying inputs and outputs by operation *and* node is what lets one app run
several workflows without their values overwriting each other.

The reducer is pure, and the web runtime, the CLI harness, and the eval suites
all drive the same one. What you see in `nodetool app debug` is what the browser
does.

### The run lifecycle

1. A widget event dispatches an action — `run`, `cancel`, `setVariable`,
   `toggleVariable`, `resourceCommand`, or `openResource`. Actions are data the
   runtime interprets; there is no place to write a statement.
2. For `run`, the operation's policy decides what happens if it is already
   running: `parallel` starts anyway, `replace` cancels the live invocations
   first, `queue` waits for them to settle.
3. Params are built at the execution boundary. Each input takes its value from
   its mapping: the bound widget (the default), a variable, a constant, or the
   currently selected resource. Node IDs become the names the run protocol
   wants, which is why a graph rename never reaches the document.
4. The invocation is created, its output slots go `pending`, and the run starts
   on the operation's workflow.
5. Run messages fold into state events. Every message is matched to an
   invocation by `job_id`; a message from a job this instance did not start is
   dropped. That is what keeps a second tab, an overlapping run, or a run
   launched from a workflow tab from contaminating what the app shows.
6. Values land in their output slot, and, when the operation maps that output
   `to: "variable"`, in an app variable too. Streamed strings concatenate;
   structured items collect into a list. A new run starts a fresh value rather
   than appending to the previous one's.

### Execution state

Every operation exposes four fields a widget can bind to, so an app over a slow
or agentic workflow shows more than a spinner:

- `running` — true while any invocation is live.
- `progress` — the active invocation's progress.
- `error` — the active invocation's error.
- `activity` — the most recent human-readable label the run emitted: the tool an
  agent is calling, the planning phase it is in, the step it is on.

Bind `activity` to a Text widget on any app that wraps an agent. Without it the
user watches a spinner for two minutes with no idea whether anything is
happening.

### The logic that lives in the app

Three things, and the vocabulary is closed on purpose:

- **`visibleWhen`** — hide a widget unless a condition holds.
- **`disabledWhen`** — disable it while a condition holds.
- **`format`** — a `{binding|filter}` template rendered in place of the raw
  value.

Conditions compare one bound value against a literal with one of nine
operators. Format templates pipe a value through one of six filters. Anything
beyond that belongs in the graph. If your app wants a derived value, compute it
in a node and bind a widget to the output.

## Debugging an app

`nodetool app debug` runs the whole app headlessly: it validates every binding
against each operation's workflow, seeds input defaults, applies params, clicks
the run trigger (or a scripted interaction sequence), executes on the kernel
runner, folds the streamed messages, and reports each widget's final state. It
runs every declared operation, not only the first.

```bash
npm run dev:nodetool -- app debug <application_id>
npm run dev:nodetool -- app debug my-app.json      # an ApplicationBundle file
npm run dev:nodetool -- app debug <id> --no-run    # wiring check only
npm run dev:nodetool -- app debug <id> --json      # full report
```

The verdict catches app-level failures a workflow-only run cannot: a binding to
a missing input or output, an app with no run trigger, a display widget that
never receives a value, an output mapped to an undeclared variable, an event
naming an operation the document does not declare, and an elapsed timeout.

Two things it does not simulate: `visibleWhen`/`disabledWhen`/`format` (a widget
hidden by a condition is reported as if visible), and `from: "resource"` inputs,
which have no provider outside the browser.

For a workflow underneath, `nodetool validate` is the cheap pre-flight and
`nodetool debug` is the full run. See [Workflow Debugging](workflow-debugging.md).

## Related

- [Building Mini Apps](mini-apps-guide.md) — recipes per use case
- [Mini App Reference](mini-apps-reference.md) — widgets, bindings, schema
- [App Builder](app-builder.md) — the editor
- [Workflow Editor](workflow-editor.md) — building the graphs underneath
- [Key Concepts](key-concepts.md) — how workflows, assets, and apps fit together
