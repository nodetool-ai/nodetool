---
layout: page
title: "Team Lead"
node_type: "nodetool.team.TeamLead"
namespace: "nodetool.team"
---

**Type:** `nodetool.team.TeamLead`

**Namespace:** `nodetool.team`

## Description

Orchestrate a team of AI agents connected via control edges. Tasks are persisted in the database.
    multi-agent, team, collaboration, orchestration, lead

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| objective | `str` | The team's objective — what they should accomplish together | `` |
| strategy | `str` | Team strategy: coordinator (lead decomposes work), autonomous (self-organizing), hybrid (lead + autonomous subtasks) | `coordinator` |
| max_iterations | `int` | Maximum total LLM calls across all agents | `50` |
| max_concurrency | `int` | Maximum number of agents running simultaneously | `3` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| result | `json` |  |
| board | `json` |  |
| messages | `list` |  |
| events | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.team](../) namespace.
