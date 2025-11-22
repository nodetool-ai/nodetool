---
layout: page
title: "Execute Python"
node_type: "nodetool.code.ExecutePython"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecutePython`

**Namespace:** `nodetool.code`

## Description

Executes Python code with safety restrictions.
    python, code, execute

    Use cases:
    - Run custom data transformations
    - Prototype node functionality
    - Debug and testing workflows

    IMPORTANT: Only enabled in non-production environments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| code | `any` | Python code to execute as-is. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `any` | Docker image to use for execution | `python:3.11-slim` |
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

