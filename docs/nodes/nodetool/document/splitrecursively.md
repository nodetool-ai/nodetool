---
layout: page
title: "Split Recursively"
node_type: "nodetool.document.SplitRecursively"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SplitRecursively`

**Namespace:** `nodetool.document`

## Description

Splits text recursively using LangChain's RecursiveCharacterTextSplitter.
    text, split, chunks

    Use cases:
    - Splitting documents while preserving semantic relationships
    - Creating chunks for language model processing
    - Handling text in languages with/without word boundaries

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `any` |  | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| chunk_size | `any` | Maximum size of each chunk in characters | `1000` |
| chunk_overlap | `any` | Number of characters to overlap between chunks | `200` |
| separators | `any` | List of separators to use for splitting, in order of preference | `['\n\n', '\n', '.']` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| source_id | `any` |  |
| start_index | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.

