---
layout: page
title: "Replace with Regex"
node_type: "nodetool.text.RegexReplace"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.RegexReplace`

**Namespace:** `nodetool.text`

## Description

Replace text matching a regex pattern.
    regex, replace, substitute

    Use cases:
    - Clean or standardize text
    - Remove unwanted patterns
    - Transform text formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text to perform replacements on | `` |
| pattern | `str` | Regular expression pattern | `` |
| replacement | `str` | Replacement text | `` |
| count | `int` | Maximum replacements (0 for unlimited) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

