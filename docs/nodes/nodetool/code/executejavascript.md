---
layout: page
title: "Execute Java Script"
node_type: "nodetool.code.ExecuteJavaScript"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecuteJavaScript`

**Namespace:** `nodetool.code`

## Description

Executes JavaScript (Node.js) code with safety restrictions.
    javascript, nodejs, code, execute

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| code | `str` | JavaScript code to execute as-is under Node.js. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `Enum['node:22-alpine']` | Docker image to use for execution | `node:22-alpine` |
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

