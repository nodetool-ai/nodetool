---
layout: page
title: "SQLite Agent"
node_type: "nodetool.agents.SQLiteAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.SQLiteAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven SQLite skill with guarded query execution.
    skills, data, sqlite, query

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for optional agent reasoning over query results. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt for data query/transform task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `120` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |
| db_path | `str` | Path to SQLite database relative to workspace. | `memory.db` |
| allow_mutation | `bool` | Allow INSERT/UPDATE/DELETE/DDL statements when enabled. | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| json | `dict[str, any]` |  |
| dataframe | `dataframe` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
