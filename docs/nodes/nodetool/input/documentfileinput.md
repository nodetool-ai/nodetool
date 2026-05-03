---
layout: page
title: "Document File Input"
node_type: "nodetool.input.DocumentFileInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.DocumentFileInput`

**Namespace:** `nodetool.input`

## Description

Accepts a local file path pointing to a document and converts it into a 'DocumentRef'.
    input, parameter, document, file, path, local_file, load

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `str` | The path to the document file. | `` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `document` |  |
| path | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.
