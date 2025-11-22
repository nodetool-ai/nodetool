---
layout: page
title: "Extract Headers"
node_type: "lib.markdown.ExtractHeaders"
namespace: "lib.markdown"
---

**Type:** `lib.markdown.ExtractHeaders`

**Namespace:** `lib.markdown`

## Description

Extracts headers and creates a document structure/outline.
    markdown, headers, structure

    Use cases:
    - Generate table of contents
    - Analyze document structure
    - Extract main topics from documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| markdown | `str` | The markdown text to analyze | `` |
| max_level | `int` | Maximum header level to extract (1-6) | `6` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[str, any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.markdown](../) namespace.

