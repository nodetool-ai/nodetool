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
| code | `str` | Python code to execute as-is. Dynamic inputs are provided as local vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `Enum['python:3.11-slim', 'jupyter/scipy-notebook:latest']` | Docker image to use for execution | `python:3.11-slim` |
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

