---
layout: page
title: "Split into Sentences"
node_type: "nodetool.document.SplitSentences"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SplitSentences`

**Namespace:** `nodetool.document`

## Description

Splits text into sentences using LangChain's SentenceTransformersTokenTextSplitter.
    sentences, split, nlp

    Use cases:
    - Natural sentence-based text splitting
    - Creating semantically meaningful chunks
    - Processing text for sentence-level analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `document` |  | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| chunk_size | `int` | Maximum number of tokens per chunk | `40` |
| chunk_overlap | `int` | Number of tokens to overlap between chunks | `5` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| source_id | `str` |  |
| start_index | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.

