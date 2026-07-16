---
layout: page
title: "Agents and Automation"
description: "Use NodeTool from an agent or automation: install it, discover nodes, run workflows, and inspect jobs."
---

NodeTool is an open-source visual workflow runtime for AI models, tools, agents, media generation, and data processing. This guide is the entry point for software agents and automated integrations.

## Start here

1. [Install NodeTool](../installation) and start a server with `npm run dev:server`.
2. [Find node schemas](../nodes/) or fetch the [node catalog](../nodes/catalog.json).
3. [Create and validate a workflow](../workflow-api).
4. [Run and inspect a workflow](../cli) with the CLI or API.

## Machine-readable resources

- [Documentation index](../llms.txt)
- [Complete documentation](../llms-full.txt)
- [Node catalog](../nodes/catalog.json)
- [Workflow API](../workflow-api)
- [WebSocket API](../websocket-api)

## Verify a workflow

Run the cheap structural check before execution:

```bash
npm run dev:nodetool -- validate workflow.json
```

After a valid result, execute it and inspect its output:

```bash
npm run dev:nodetool -- debug workflow.json
```

The command prints the workflow status, output values, errors, and job logs. A successful run has a completed status and no execution errors.
