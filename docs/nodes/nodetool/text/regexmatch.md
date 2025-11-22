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
|----------|------|-------------|----------|
| text | `any` | Text to search in | `` |
| pattern | `any` | Regular expression pattern | `` |
| group | `any` | Capture group to extract (0 for full match) | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

