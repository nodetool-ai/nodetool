---
layout: page
title: "Find Regex Matches"
node_type: "nodetool.text.RegexMatch"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.RegexMatch`

**Namespace:** `nodetool.text`

## Description

Find all matches of a regex pattern in text.
    regex, search, pattern, match

    Use cases:
    - Extract specific patterns from text
    - Validate text against patterns
    - Find all occurrences of a pattern

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | Text to search in | `` |
| pattern | `str` | Regular expression pattern | `` |
| group | `int` | Capture group to extract (0 for full match) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
