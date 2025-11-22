---
layout: page
title: "Document Output"
node_type: "nodetool.output.DocumentOutput"
namespace: "nodetool.output"
---

**Type:** `nodetool.output.DocumentOutput`

**Namespace:** `nodetool.output`

## Description

Output node for document content references ('DocumentRef').
    document, file, pdf, text_file, asset, reference

    Use cases:
    - Displaying or returning processed or generated documents.
    - Passing document data (as a 'DocumentRef') between workflow nodes.
    - Returning results of document analysis or manipulation.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` |  | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `any` | The description of the output for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.output](../) namespace.

