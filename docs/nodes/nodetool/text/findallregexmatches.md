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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| regex | `str` |  | `` |
| dotall | `bool` |  | `false` |
| ignorecase | `bool` |  | `false` |
| multiline | `bool` |  | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
