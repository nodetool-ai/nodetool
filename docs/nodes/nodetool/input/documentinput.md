---
layout: page
title: "Document Input"
node_type: "nodetool.input.DocumentInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.DocumentInput`

**Namespace:** `nodetool.input`

## Description

Accepts a reference to a document asset for workflows, specified by a 'DocumentRef'.  A 'DocumentRef' points to a structured document (e.g., PDF, DOCX, TXT) which can be processed or analyzed. This node is used when the workflow needs to operate on a document as a whole entity, potentially including its structure and metadata, rather than just raw text.
    input, parameter, document, file, asset, reference

    Use cases:
    - Load a specific document (e.g., PDF, Word, text file) for content extraction or analysis.
    - Pass a document to models that are designed to process specific document formats.
    - Manage documents as distinct assets within a workflow.
    - If you have a local file path and need to convert it to a 'DocumentRef', consider using 'DocumentFileInput'.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `document` | The document to use as input. | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `document` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

