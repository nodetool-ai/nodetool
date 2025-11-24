---
layout: page
title: "Extract Links"
node_type: "lib.markdown.ExtractLinks"
namespace: "lib.markdown"
---

**Type:** `lib.markdown.ExtractLinks`

**Namespace:** `lib.markdown`

## Description

Extracts all links from markdown text.
    markdown, links, extraction

    Use cases:
    - Extract references and citations from academic documents
    - Build link graphs from markdown documentation
    - Analyze external resources referenced in markdown files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| markdown | `str` | The markdown text to analyze | `` |
| include_titles | `bool` | Whether to include link titles in output | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[str, str]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.markdown](../) namespace.

