---
layout: page
title: "File Path Input"
node_type: "nodetool.input.FilePathInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.FilePathInput`

**Namespace:** `nodetool.input`

## Description

Accepts a local filesystem path (to a file or directory) as input for workflows.
    input, parameter, path, filepath, directory, local_file, filesystem

    Use cases:
    - Provide a local path to a specific file or directory for processing.
    - Specify an input or output location on the local filesystem for a development task.
    - Load local datasets or configuration files not managed as assets.
    - Not available in production: raises an error if used in a production environment.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The path to use as input. | `` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

