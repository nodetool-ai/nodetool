---
layout: page
title: "PDF Search Text"
node_type: "lib.pdf.SearchText"
namespace: "lib.pdf"
---

**Type:** `lib.pdf.SearchText`

**Namespace:** `lib.pdf`

## Description

Search a PDF for a phrase and return each match with its page number and bounding box.
    pdf, search, find, phrase, text, location, bbox

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| phrase | `str` | Text phrase to search for | `` |
| case_sensitive | `bool` | Whether the search is case-sensitive | `false` |
| start_page | `int` | First page to search (0-based) | `0` |
| end_page | `int` | Last page to search (-1 for all) | `-1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[dict]` |  |

## Related Nodes

Browse other nodes in the [lib.pdf](../) namespace.
