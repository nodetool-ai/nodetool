---
layout: page
title: "App Builder"
description: "Design Mini App interfaces for workflows"
---

App Builder turns a workflow into a custom Mini App. You place widgets on a
canvas, bind them to workflow inputs and outputs, and publish the app document
onto the workflow.

## What it does

- Builds a structured app document with inputs, actions, display widgets, and layout blocks.
- Binds widgets to existing Input and Output node names.
- Runs the workflow from buttons or change events.
- Streams workflow outputs into bound display widgets.
- Saves the app document with the workflow and serves it in Mini App mode.

## Where this fits

A Mini App is how a **workflow** reaches people who should not have to read a node graph. App Builder wraps the graph in a form: input widgets bind to Input nodes, buttons run the workflow, and display widgets stream Output nodes back. It is the share end of NodeTool's loop — the same **assets** a workflow produces on the canvas, exposed as a usable app.

See [Key Concepts → How everything fits together](key-concepts.md#how-everything-fits-together) for the full loop.

## Open App Builder

1. Open a workflow.
2. Switch the tab to **App** mode.
3. Click **App Builder** in the tab bar.

The builder opens at `/app-builder/:workflowId`.

## Build an app

1. Add Input nodes and Output nodes to the workflow first. Their `name` fields are the binding keys.
2. Add input widgets such as Text Input, Number Input, Slider, Switch, or Select.
3. Set each input widget's binding to the matching Input node name.
4. Add a Button with the **Run workflow** action.
5. Add display widgets such as Text, Markdown, Image, JSON, or Progress.
6. Set each display widget's binding to the matching Output node name.
7. Click **Publish**.

## Agent-assisted editing

Click **Ask Agent** in App Builder to open the builder agent. It can inspect the
workflow, add widgets, set bindings, and update the workflow graph when an app
needs new Input, Output, or Variable nodes.

Good prompts name the result you want:

> Build a compact app for this workflow with all inputs on the left, a run
> button below them, and outputs on the right.

## Bindings

Bindings must match workflow state exactly:

| Widget kind | Bind to |
| --- | --- |
| Input widgets | Input node `name` |
| Display widgets | Output node `name` |
| State controls | Variable node name |

If a binding does not match a node name, the widget has no data to read or write.

## Mini App mode

Mini App mode renders the App Builder document when one exists. If a workflow has
no app document, NodeTool renders the generated input/output form.

## Related topics

- [Workflow Editor](workflow-editor.md)
- [Mini Apps](getting-started.md#step-4--build-an-app)
- [Chat & Agents](global-chat-agents.md)
- [Key Concepts](key-concepts.md)
