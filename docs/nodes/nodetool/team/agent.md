---
layout: page
title: "Agent"
node_type: "nodetool.team.Agent"
namespace: "nodetool.team"
---

**Type:** `nodetool.team.Agent`

**Namespace:** `nodetool.team`

## Description

An individual AI agent that receives work from a TeamLead via control edges.
    agent, team, controlled, worker

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | Agent name, e.g. 'researcher', 'writer' | `` |
| role | `str` | Freeform role description injected into the agent's system prompt | `General purpose assistant` |
| skills | `list` | Skill tags for task matching, e.g. ['web_search', 'code_generation'] | `[]` |
| provider | `str` | LLM provider key | `anthropic` |
| model | `str` | Model identifier | `claude-sonnet-4-20250514` |
| tools | `list` | Additional tool names this agent can use (beyond team tools) | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| result | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.team](../) namespace.
