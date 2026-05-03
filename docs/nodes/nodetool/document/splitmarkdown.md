---
layout: page
title: "Split Markdown"
node_type: "nodetool.document.SplitMarkdown"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SplitMarkdown`

**Namespace:** `nodetool.document`

## Description

Splits markdown text by headers while preserving header hierarchy in metadata.
    markdown, split, headers

    Use cases:
    - Splitting markdown documentation while preserving structure
    - Processing markdown files for semantic search
    - Creating context-aware chunks from markdown content

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| document | `document` |  | `{"type":"document","uri":"","asset_id":null,"da...` |
| headers_to_split_on | `list[tuple[str, str]]` | List of tuples containing (header_symbol, header_name) | `[["#","Header 1"],["##","Header 2"],["###","Hea...` |
| strip_headers | `bool` | Whether to remove headers from the output content | `true` |
| return_each_line | `bool` | Whether to split into individual lines instead of header sections | `false` |
| chunk_size | `int` | Optional maximum chunk size for further splitting | `1000` |
| chunk_overlap | `int` | Overlap size when using chunk_size | `30` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| source_id | `str` |  |
| start_index | `int` |  |
| chunks | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.
