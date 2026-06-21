---
layout: page
title: "Agent Step"
node_type: "nodetool.agents.AgentStep"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.AgentStep`

**Namespace:** `nodetool.agents`

## Description

LLM step that inherits the workflow's configured model.
    agents, llm, step, reasoning

    Use this node inside agent-mode workflows when you need an LLM to
    reason, transform text, or call tools. The step receives upstream
    edges as context, runs the workflow's configured LLM, and emits the
    final text on its `output` handle.

    Properties:
    - instructions (required): the prompt for this step
    - tools (optional): list of tool names this step may call
    - output_schema (optional): JSON schema (as a string) constraining the output

    Unlike Agent / Summarizer, this node does NOT take a model property —
    the workflow's configured model is used.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| instructions | `str` | Instructions for the LLM step (acts as the user prompt). | `` |
| tools | `list[str]` | Optional list of tool names the step is allowed to call. Empty = no tools. | `[]` |
| output_schema | `str` | Optional JSON schema (as a string) constraining the step output. Empty = freeform text. | `` |
| input | `any` | Upstream data forwarded to the step as context. Connect any node here. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](./) namespace.
