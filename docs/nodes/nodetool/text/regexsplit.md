---
layout: page
title: "Split with Regex"
node_type: "nodetool.text.RegexSplit"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.RegexSplit`

**Namespace:** `nodetool.text`

## Description

Split text using a regex pattern as delimiter.
    regex, split, tokenize

    Use cases:
    - Parse structured text
    - Extract fields from formatted strings
    - Tokenize text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `str` | Text to split | `` |
| pattern | `str` | Regular expression pattern to split on | `` |
| maxsplit | `int` | Maximum number of splits (0 for unlimited) | `0` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

