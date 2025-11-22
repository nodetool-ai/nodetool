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
| code | `any` | JavaScript code to execute as-is under Node.js. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `any` | Docker image to use for execution | `node:22-alpine` |
| execution_mode | `any` | Execution mode: 'docker' or 'subprocess' | `docker` |
| stdin | `any` | String to write to process stdin before any streaming input. Use newlines to separate lines. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `any` |  |
| stderr | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.

