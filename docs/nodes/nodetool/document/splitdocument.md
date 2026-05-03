---
layout: page
title: "Split Document"
node_type: "nodetool.document.SplitDocument"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SplitDocument`

**Namespace:** `nodetool.document`

## Description

Split text semantically.
    chroma, embedding, collection, RAG, index, text, markdown, semantic

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| embed_model | `language_model` | Embedding model to use | `{"type":"language_model","provider":"ollama","i...` |
| document | `document` | Document ID to associate with the text content | `{"type":"document","uri":"","asset_id":null,"da...` |
| buffer_size | `int` | Buffer size for semantic splitting | `1` |
| threshold | `int` | Breakpoint percentile threshold for semantic splitting | `95` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| source_id | `str` |  |
| start_index | `int` |  |
| chunks | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.
