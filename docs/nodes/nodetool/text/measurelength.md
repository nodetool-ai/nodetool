---
layout: page
title: "Measure Length"
node_type: "nodetool.text.Length"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Length`

**Namespace:** `nodetool.text`

## Description

Measures text length as characters, words, or lines.
    text, analyze, length, count

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| measure | `enum` | Choose whether to count characters, words, or lines | `characters` |
| trim_whitespace | `bool` | Strip whitespace before counting | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
