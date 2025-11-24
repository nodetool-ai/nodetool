---
layout: page
title: "Find All Regex Matches"
node_type: "nodetool.text.FindAllRegex"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.FindAllRegex`

**Namespace:** `nodetool.text`

## Description

Finds all regex matches in text as separate substrings.
    text, regex, find

    Use cases:
    - Identifying all occurrences of a pattern in text
    - Extracting multiple instances of structured data
    - Analyzing frequency and distribution of specific text patterns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` |  | `` |
| regex | `str` |  | `` |
| dotall | `bool` |  | `False` |
| ignorecase | `bool` |  | `False` |
| multiline | `bool` |  | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

