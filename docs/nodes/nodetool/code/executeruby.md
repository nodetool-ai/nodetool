---
layout: page
title: "Execute Ruby"
node_type: "nodetool.code.ExecuteRuby"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecuteRuby`

**Namespace:** `nodetool.code`

## Description

Executes Ruby code with safety restrictions.
    ruby, code, execute

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| code | `str` | Ruby code to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `Enum['ruby:3.3-alpine']` | Docker image to use for execution | `ruby:3.3-alpine` |
| execution_mode | `Enum['docker', 'subprocess']` | Execution mode: 'docker' or 'subprocess' | `docker` |
| stdin | `str` | String to write to process stdin before any streaming input. Use newlines to separate lines. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.

