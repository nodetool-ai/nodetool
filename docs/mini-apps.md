---
layout: page
title: "Mini Apps"
description: "What a Mini App is, the words you need to read the rest of the docs, and how the pieces fit together."
---

A Mini App is a simple screen in front of a workflow. Instead of a canvas full of
connected nodes, the person using it sees a text box, a button, and a result.

Say you built a workflow that turns a product photo into a caption. It has a
dozen nodes: the model, the prompt, retries, formatting. You want a coworker to
use it, but not to edit it, and not to have to understand it. So you build a Mini
App: one field for the photo, one button that says "Write the caption", and one
box where the caption appears. Same workflow underneath, nothing to break.

- **[Building Mini Apps](mini-apps-guide.md)** — nine app shapes, each built step
  by step. Start here if you want to make one.
- **[Mini App Reference](mini-apps-reference.md)** — every widget, setting, and
  field, in tables.
- **[App Builder](app-builder.md)** — the editor you build the screen in.
- **[Mini Apps on Mobile](mini-apps-mobile.md)** — opening and running the same
  app from a phone.

## The words

These five terms cover most of what the rest of these pages say.

| Term | What it means |
| --- | --- |
| **Workflow** | The node graph that does the actual work. It already exists before you build an app. |
| **Widget** | One thing on the app screen: a text box, a button, an image, a slider. |
| **Binding** | The wiring between a widget and the workflow. "This text box fills the Prompt input." "This image shows the Result output." |
| **Operation** | One workflow the app can run, plus how its inputs and outputs are wired. An app that runs two workflows has two operations. |
| **Variable** | A value the app remembers between runs — a draft to review, a setting like "always translate to German". |

Two more you meet in the workflow editor, not the app:

- An **Input node** is a node in the graph that marks a value coming in from
  outside. Widgets that the user types into bind to Input nodes.
- An **Output node** marks a value going out. Widgets that show a result bind to
  Output nodes.

If a value has no Input node, no widget can change it. If a result has no Output
node, no widget can show it. Getting these into the graph is the first step of
building any app.

## What Mini Apps are good for

A node graph is the right screen for the person who built the pipeline and the
wrong one for everyone else. It shows model choices, retry paths, and half-built
intermediate steps that someone who just wants a caption doesn't need and
shouldn't be able to break. A Mini App narrows it to the two or three fields that
actually change.

| The situation | What the app does about it |
| --- | --- |
| A coworker needs to run your workflow but not edit it | They get fields and a Run button. The graph isn't reachable from the app. |
| The workflow has 40 nodes and 3 things worth changing | Only those 3 get widgets. The rest stays fixed in the graph. |
| A run takes 90 seconds and looks frozen | Add a progress bar and a status line that says what the run is doing right now. |
| The result arrives a word at a time | Display widgets collect what streams in. Text builds up into one block instead of flickering. |
| One screen should drive several workflows | Give the app one operation per workflow. Each gets its own fields, results, and button. |
| Someone must approve a draft before the next step | Step one writes a variable, a widget shows it, a second button runs step two using that variable. |
| Dragging a slider should re-run the workflow | Bind the slider to a setting in the graph and have it re-run when you let go. |
| The same tool is used daily with the same settings | Mark a variable as remembered, and it survives across sessions. |

Don't build one for a workflow you'll run once, for a pipeline another program
calls (use the [Workflow API](workflow-api.md)), or for an open-ended task with
no fixed shape (use [Chat](global-chat.md)).

## Where apps live

An app is its own thing, not a setting on a workflow. It has its own name,
version history, releases, and spending limit — none of which belong on a graph.
Opening a workflow never creates an app, and a workflow without an app is just a
workflow.

| Where | How to get there |
| --- | --- |
| Apps panel | Left sidebar → **Apps**. Every app you own, plus **New app** and **New app from workflow**. |
| App tab | Click an app. It opens as a workspace tab with three views: **Design**, **Run**, **Settings**. |
| Linked workflows | A menu on the app tab, listing the workflows this app runs. Click one to open it as a normal workflow tab. |
| Terminal | `nodetool app debug <application_id>`. See [Checking an app](#checking-an-app). |

**Design** is where you place and wire widgets:

![Mini App — Design view](assets/screenshots/mini-app-design.png)

**Run** is what the person using the app sees — the fields, the button, and the
result:

![Mini App — Run view](assets/screenshots/mini-app-run.png)

Apps run wherever their workflows run: the desktop app, a server you host, or
NodeTool Cloud. On mobile, a published app opens as its own screen.

### Making one

- **New app** starts empty. You add an operation, pick the workflow it runs, and
  place widgets yourself.
- **New app from workflow** builds a starting point for you: one operation bound
  to the workflow you picked, and a widget for every Input and Output node it
  has. This is a copy, made once. From then on the app and the workflow are
  separate, and editing one doesn't change the other.

### Publishing and sharing

**Publish** takes a snapshot. It saves the current screen as a version and locks
in the current state of every workflow the app runs, so a published app keeps
working the way it did on release day while you keep editing the drafts. A
spending limit caps what a published app may cost, and every run counts against
it.

To hand an app to someone else, export a **bundle**: one JSON file holding the
app *and* the full graph of every workflow it runs. They import it and get a
working app plus its workflows. Inside the file the app refers to its workflows
by a local nickname; importing swaps those for the real ids of the workflows it
creates. The example apps NodeTool ships are bundles, installed the same way.

## How it works

Four pieces. Only one of them computes anything.

```
App document               (what you build in the editor)
  ui           the layout: which widgets, where, wired to what
  operations   which workflows the app runs, and how they're wired
  variables    values the app remembers
  resources    handles to an asset, timeline, storyboard, or sketch
        │
        │  the wiring is checked against the real graphs
        ▼
Instance state             (what one open copy of the app is holding)
  inputs · outputs · variables · widget state · runs in flight
        │
        │  messages from the run update the state as they arrive
        ▼
Workflow runs              (where all the actual work happens)
```

The document is configuration, not code. Nothing in it branches, loops, or calls
a model — that's the graph's job. This is on purpose: logic in a graph can be
tested, cached, and read by the agent. Logic hidden in an app screen can't.

### The app document

Everything you build in the editor is saved as one document with four parts:

- **`ui`** — the layout. Which widgets are on the screen, where, and what each
  one is wired to.
- **`operations`** — the workflows this app can run. Each operation has a name,
  the workflow it runs, wiring for each input and output, a rule for what happens
  when you click Run while it's already running, and an optional time limit. One
  app can run several workflows, or the same workflow twice wired differently
  (`translateTitle` and `translateBody`).
- **`variables`** — the values the app remembers, each with a type, a starting
  value, and whether it survives a reload.
- **`resources`** — handles to a real document (an asset, timeline, storyboard,
  or sketch) that the app is allowed to read or edit.

Operations are what make an app more than a form over one graph. A transcription
app can run a transcriber, a summarizer, and a translator from one screen.

### Bindings

A binding is a short string that says which slot a widget is wired to. You pick
these from a menu in the editor; you rarely type them. They look like this:

```
op:<opId>/in:<nodeId>            an input of a workflow
op:<opId>/out:<nodeId>           an output of a workflow
op:<opId>/prop:<nodeId>#<prop>   a setting on a node, driven by a widget
op:<opId>/exec#<field>           run status: running | progress | error | activity
var:<variableId>                 a value the app remembers
view:<componentId>#<prop>        state that belongs to one widget, never saved
```

Two details worth knowing:

- Every binding names its operation, so two operations running the same workflow
  never read each other's values.
- Bindings point at node **ids**, not names. Renaming an Input node in the graph
  editor can't break an app. Older apps that used names still work — the name is
  looked up in the live graph, and the editor rewrites it to the id form when it
  can.

A binding that points at nothing is reported as an error, not quietly ignored.
Both the editor and `nodetool app debug` will tell you.

### What one open app holds

While an app is open it holds a bundle of current values, split into five groups
so nothing collides:

| Group | Keyed by | Holds |
| --- | --- | --- |
| `inputs` | operation + node | What's currently in each field, and whether the user typed it or it's still the default. |
| `outputs` | operation + node | Each result and its status: `empty`, `pending`, `streaming`, `done`. |
| `variables` | variable | The values the app remembers. |
| `view` | widget + property | State belonging to one widget. Never saved. |
| `invocations` | job id | One entry per run: status, progress, error, and what it's doing. |

Keying inputs and outputs by operation *and* node is what lets one app run
several workflows without their values landing on top of each other.

The same code updates this state in the browser, in the `nodetool app debug`
harness, and in the test suites. What the harness reports is what the browser
does.

### What happens when you click Run

1. The widget fires an action: `run`, `cancel`, `setVariable`, `toggleVariable`,
   or one of the resource actions. Actions are settings the runtime carries out;
   there's nowhere to write a statement.
2. If the operation is already running, its rule decides: `parallel` starts
   another anyway, `replace` cancels the one in flight first, `queue` waits.
3. The values are collected. Each input takes its value from wherever it's wired:
   the widget (the usual case), a variable, a fixed value, or the currently
   selected resource.
4. The run starts, and every result slot it will fill goes to `pending`.
5. Messages come back from the run and update the screen. Each one is matched to
   the run that produced it by job id, and anything from a job this app didn't
   start is thrown away. That's what stops a second tab, an overlapping run, or a
   run launched from a workflow tab from polluting what the app shows.
6. Values land in their result slot — and also in a variable, if the operation is
   wired that way. Streamed text builds up; streamed items collect into a list.
   Clicking Run again starts fresh instead of appending to the last result.

### Showing that something is happening

Every operation exposes four things a widget can display, so an app over a slow
workflow shows more than a spinner:

- `running` — true while a run is in flight.
- `progress` — how far along it is.
- `error` — what went wrong, if anything.
- `activity` — a line of plain text the run writes about itself: the tool an
  agent is calling, the planning stage, the step it's on.

If your app wraps an agent, put `activity` on the screen. Without it the user
stares at a spinner for two minutes with no idea whether anything is happening.

### The little logic an app can do

Three things, and the list is short on purpose:

- **Show a widget only when something is true** (`visibleWhen`).
- **Grey a widget out while something is true** (`disabledWhen`).
- **Reformat a value before showing it** (`format`) — round a number, shorten a
  string, join a list.

A condition compares one value against one fixed value, using one of nine
operators. Formatting runs a value through one of six filters. Anything past
that belongs in the graph: compute the value in a node and show that node's
output.

## Checking an app

`nodetool app debug` runs the whole app without a browser. It checks every
binding against the real workflow, fills in the default values, clicks the Run
button (or follows a script you give it), runs the workflow, and reports what
every widget ended up showing. It runs all of the app's operations, not just the
first.

```bash
npm run dev:nodetool -- app debug <application_id>
npm run dev:nodetool -- app debug my-app.json      # a bundle file
npm run dev:nodetool -- app debug <id> --no-run    # check the wiring, don't run
npm run dev:nodetool -- app debug <id> --json      # full report
```

It catches the mistakes a workflow-only test can't: a widget wired to an input or
output that doesn't exist, an app with no way to start a run, a display widget
that never receives anything, a result wired to a variable that was never
declared, a button pointing at an operation the app doesn't have, and a run that
hit its time limit.

It follows your conditions too: a widget hidden or disabled by `visibleWhen` or
`disabledWhen` can't be clicked, so a script that tries reports the condition
that blocked it, and a Run button no state ever makes visible is an error. A
widget with a `format` template is reported as the template renders it.

Resources work too, from a collection you seed. Give the run the items a
picker, gallery, or scene list would show, and an input that comes from that
resource is sent, a `create`/`update`/`delete` button changes the collection,
and the report lists what it holds at the end. A run whose input reads a
collection nothing seeded fails and tells you how to seed it.

```bash
npm run dev:nodetool -- app debug <id> \
  --interact '[{"seedResource":{"id":"boards","items":[{"id":"b1","name":"Opening"}]}},{"click":"Run"}]'
npm run dev:nodetool -- app debug <id> --params '{"resource:boards":[{"id":"b1"}]}'
```

What it can't check: how the app looks — layout, styling, focus — and your
stored resources, since the run reads the seeded collection rather than the
database, and has no editor for `openResource` to open.

To debug the workflow itself, `nodetool validate` is the quick check and
`nodetool debug` is the full run. See [Workflow Debugging](workflow-debugging.md).

## Related

- [Building Mini Apps](mini-apps-guide.md) — recipes, step by step
- [Mini App Reference](mini-apps-reference.md) — widgets, bindings, schema
- [App Builder](app-builder.md) — the editor
- [Workflow Editor](workflow-editor.md) — building the graphs underneath
- [Key Concepts](key-concepts.md) — how workflows, assets, and apps fit together
