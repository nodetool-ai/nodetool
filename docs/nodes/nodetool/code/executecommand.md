---
layout: page
title: "Execute Command"
node_type: "nodetool.code.ExecuteCommand"
namespace: "nodetool.code"
---

**Type:** `nodetool.code.ExecuteCommand`

**Namespace:** `nodetool.code`

## Description

Executes a single shell command inside a Docker container.
    command, execute, shell, bash, sh

    IMPORTANT: Only enabled in non-production environments

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| command | `str` | Single command to run via the selected shell. Stdout lines are emitted on 'stdout'; stderr lines on 'stderr'. | `` |
| image | `enum` | Docker image to use for execution | `bash:5.2` |
| execution_mode | `enum` | Execution mode: 'docker' or 'subprocess' | `docker` |
| stdin | `str` | String to write to process stdin before any streaming input. Use newlines to separate lines. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| stdout | `str` |  |
| stderr | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.code](../) namespace.
