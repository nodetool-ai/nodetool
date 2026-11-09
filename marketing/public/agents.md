---
title: "NodeTool, the Open-Source Creative Harness"
description: "The tools, editors, and limits an AI agent works inside for creative work."
canonical: https://nodetool.ai/agents
markdown: https://nodetool.ai/agents.md
product: NodeTool
---
# NodeTool, the Open-Source Creative Harness

Give the agent tools to create and edit images, video, audio and workflows. Use NodeTool’s built-in agent, or connect Claude Code, Codex or Cursor through MCP. Inspect its work and take over whenever you need to.

## Build. Validate. Run. Inspect. Repair.

A chat assistant answers once and stops. Inside the harness, the agent works on a saved workflow, so it can see which step failed and fix that step.

- **Build** (`create_workflow`): The agent adds nodes, picks models, and wires the graph. It checks that the selected providers and models exist before saving the workflow.
- **Validate** (`validate_workflow`): Check the workflow for errors before calling a model.
- **Run** (`run_workflow`): The graph calls your local models and provider accounts. A run whose provider has no key is refused before the first node starts.
- **Inspect** (`get_job_logs`): Every tool call, output, and error is in the log, with the node that failed.
- **Repair** (`create_workflow_version`): The agent saves its changes as a new version, so you can return to the previous one.

## The graph is checked before it runs

Validation catches errors before the workflow makes paid model calls. `validate_workflow` reports:

- Unknown node types
- Required properties left empty, and models never selected
- A model id the chosen provider does not offer
- Edges that connect the wrong types, or lead nowhere
- Code nodes that do not parse, read an undefined name, or leave an output unset
- Provider keys this install cannot find

## Eight editors the agent can work in

The agent edits the same documents you open in Studio. When it stops, the work is already in the editor.

- **Workflows**: Wires nodes, picks models, validates the graph, and runs it.
- **Storyboards**: Breaks a brief into shots and renders a frame for each one.
- **Timelines**: Places clips, trims the cuts, and renders the edit.
- **Scripts**: Drafts the scenes and voices the lines.
- **Sketches**: Builds a layered image and edits it one layer at a time.
- **3D scenes**: Places objects, lights, and materials, then renders the scene.
- **Games**: Places entities, writes their behaviors, generates the art, and play-tests the level.
- **Apps**: Places the widgets, binds them to a workflow, and checks that the app runs.

## Every step is on the record

Read what the agent did, and take the work back at any point.

- **A full record**: Read each tool call with its arguments, result, and error. Find the step that went wrong.
- **Take over at any time**: Stop the agent, change a node yourself, and hand the work back. It reads the graph as you left it.
- **Your keys**: When a graph needs a key this install does not have, the agent in Studio asks you for it in a dialog. A headless run fails instead of guessing.

## Permission modes

Each chat has a permission mode. Reading and searching run in every mode. The mode decides what happens to the rest.

- **Plan**: The agent investigates and proposes a plan. Nothing runs.
- **Default**: Reads run on their own. You approve each action that changes, generates, or calls out before it runs.
- **Auto**: The agent works without asking. Every tool call still goes into the log.

Connect Claude Code, Codex, or Cursor with one command. The setup, the CLI, and the HTTP API are at https://nodetool.ai/developers.md.

## Questions

### What does it mean that NodeTool is agent-first?

It means the AI agent works in the same editors you do. The node canvas, sketch pad, storyboard, video timeline, script editor, 3D scene, game editor, and app builder each give the agent the actions you have, so it can change your project the way you would. A log records every action the agent took, its result, and any error. Coding agents outside NodeTool, such as Claude Code, can use the same actions through **MCP**, the standard way AI agents connect to outside tools.

### What is a creative harness?

A harness is what an AI agent works inside: the tools it can call, the documents it can change, the models and keys it may use, and the record of what it did. NodeTool is a creative harness. It gives the built-in agent, or a coding agent such as Claude Code over **MCP**, image, video, and audio generation and the same editors you use. The agent runs on your provider accounts, every tool call is logged, and the work stays as editable workflows and projects. NodeTool is open source under AGPL-3.0.

### What is a planning agent?

A planning agent takes a goal, breaks it into steps, picks a model or tool for each step, and works through them in order, adjusting as it goes. In NodeTool an agent is a block on the canvas, so its results feed into the rest of your workflow.
