---
layout: page
title: "App Builder"
description: "Design the interface of a Mini App: place widgets, bind them to workflow inputs and outputs, publish."
---

App Builder is the **Design** view of an app tab. You place widgets on a canvas,
bind them to the inputs and outputs of the workflows the app runs, and save the
result onto the application.

This page covers the editor. For what Mini Apps solve and how the runtime works,
see [Mini Apps](mini-apps.md); for step-by-step recipes, see
[Building Mini Apps](mini-apps-guide.md); for the widget, binding, and schema
tables, see the [Reference](mini-apps-reference.md).

## What it does

- Edits the app's document: layout blocks, input widgets, actions, and display
  widgets.
- Binds widgets to the Input and Output nodes of each operation's workflow.
- Runs an operation from a button or a change event.
- Streams outputs into bound display widgets.
- Publishes a version that pins the graph of every bound workflow.

## Where this fits

A Mini App is how work reaches people who should not have to read a node graph.
App Builder wraps one or more workflows in a form: input widgets bind to Input
nodes, buttons run operations, and display widgets stream Output nodes back. It
is the share end of NodeTool's loop, exposing the same **assets** a workflow
produces on the canvas as a usable app.

See [Key Concepts → How everything fits together](key-concepts.md#how-everything-fits-together)
for the full loop.

## Open App Builder

1. Open the **Apps** panel in the left sidebar.
2. Click an app, or create one with **New app** or **New app from workflow**.
3. On the app tab, switch to **Design**.

**Run** shows the app as its users see it. **Settings** holds the name,
description, versions, and budget.

## Build an app

1. Make sure each bound workflow has the Input and Output nodes the app needs.
   Open one from the **Linked workflows** menu to edit it; it opens as its own
   workflow tab.
2. Add input widgets such as Text Input, Number Input, Slider, Switch, or Select.
3. Bind each input widget to the matching Input node.
4. Add a Button with the **Run workflow** action, targeting the operation to run.
5. Add display widgets such as Text, Markdown, Image, JSON, or Progress.
6. Bind each display widget to the matching Output node.
7. Click **Save**.

## Agent-assisted editing

Click **Ask Agent** to open the builder agent. It can read the app's workflows,
add widgets, set bindings, declare operations and variables, and edit a graph
when the app needs new Input, Output, or Variable nodes.

Good prompts name the result you want:

> Build a compact app with all inputs on the left, a run button below them, and
> outputs on the right.

## Bindings

The binding picker lists what each operation's live graph offers. Bindings key
on node ids, so renaming a node does not break the app.

| Widget kind | Binds to |
| --- | --- |
| Input widgets | An operation input (`op:<opId>/in:<nodeId>`) or a node property |
| Display widgets | An operation output (`op:<opId>/out:<nodeId>`) or a variable |
| State controls | A declared variable (`var:<variableId>`) |

A binding that resolves to nothing is reported as a validation error, in the
editor and in `nodetool app debug`. The full grammar is in the
[Reference](mini-apps-reference.md#binding-grammar).

## Multiple workflows in one app

An app's operations are edited under **Operations**. Add one per workflow the
app should run, each with its own input and output mappings, concurrency policy,
and timeout. Buttons target an operation by id, so a two-step app is two
operations and two buttons rather than two apps.

## Publish and share

**Publish** in Settings snapshots the document and pins the graph of every bound
workflow, so the released app keeps running those graphs while you keep editing
the draft. **Export bundle** writes the app and its workflows as one
`ApplicationBundle` JSON file, which imports elsewhere as a working app.

## Related topics

- [Mini Apps](mini-apps.md) — concepts and runtime
- [Building Mini Apps](mini-apps-guide.md) — recipes per use case
- [Mini App Reference](mini-apps-reference.md) — widgets, bindings, schema
- [Workflow Editor](workflow-editor.md)
- [Chat & Agents](global-chat-agents.md)
- [Key Concepts](key-concepts.md)
