---
layout: page
title: "Execute Bash"
node_type: "nodetool.code.ExecuteBash"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecuteBash`

**Namespace:** `nodetool.code`

## Description

Executes Bash script with safety restrictions.
    bash, shell, code, execute

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| code | `str` | Bash script to execute as-is. Dynamic inputs are provided as env vars. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `Enum['bash:5.2', 'debian:12', 'ubuntu:22.04', 'ubuntu:24.04', 'jupyter/scipy-notebook:latest']` | Docker image to use for execution | `ubuntu:22.04` |
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

