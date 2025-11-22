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

    Use cases:
    - Directly load a document (e.g., PDF, TXT, DOCX) from a specified local file path.
    - Convert a local file path into a 'DocumentRef' that can be consumed by other document-processing nodes.
    - Useful for development or workflows that have legitimate access to the local filesystem.
    - To provide an existing 'DocumentRef', use 'DocumentInput'.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `any` | The parameter name for the workflow. | `` |
| value | `any` | The path to the document file. | `` |
| description | `any` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| document | `any` |  |
| path | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

