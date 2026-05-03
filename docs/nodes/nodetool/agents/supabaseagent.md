---
layout: page
title: "Supabase Agent"
node_type: "nodetool.agents.SupabaseAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.SupabaseAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven Supabase skill with guarded SELECT execution.
    skills, data, supabase, query

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for optional agent reasoning over query results. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt for data query/transform task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `120` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| json | `dict[str, any]` |  |
| dataframe | `dataframe` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
