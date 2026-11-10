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
- **Run** (`run_workflow`): Run the workflow with local models or your provider accounts. Missing API keys are flagged before it starts.
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
- **Your keys**: Studio asks you to add any missing API keys. Runs started without the interface stop with an error if a required key is missing.

## Permission modes

Each chat has a permission mode. Reading and searching run in every mode. The mode decides what happens to the rest.

- **Plan**: The agent investigates and proposes a plan. Nothing runs.
- **Default**: Reads run on their own. You approve each action that changes, generates, or calls out before it runs.
- **Auto**: The agent works without asking. Every tool call still goes into the log.

Connect Claude Code, Codex, or Cursor with one command. The setup, the CLI, and the HTTP API are at https://nodetool.ai/developers.md.

## Questions

### What does it mean that NodeTool is agent-first?

The agent edits the same projects you open in NodeTool, including storyboards, timelines and workflows. You can inspect its tool calls, results and errors, then take over yourself. External coding agents can also use NodeTool through **MCP**.

### What is a creative harness?

A creative harness gives an AI agent tools, editors, model access and a record of its actions. NodeTool provides these to its built-in agent and coding agents connected through **MCP**. Their work is saved as projects and workflows you can edit.

### What is a planning agent?

A planning agent takes a goal, breaks it into steps, picks a model or tool for each step, and works through them in order, adjusting as it goes. In NodeTool an agent is a block on the canvas, so its results feed into the rest of your workflow.
