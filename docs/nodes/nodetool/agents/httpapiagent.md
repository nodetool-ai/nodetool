---
layout: page
title: "HTTP API Agent"
node_type: "nodetool.agents.HttpApiAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.HttpApiAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven HTTP API skill for calling REST/GraphQL endpoints.
    skills, http, api, rest, graphql

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for API planning and response interpretation. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing the HTTP API task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `180` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
