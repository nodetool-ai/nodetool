---
layout: page
title: "Filter Regex String"
node_type: "nodetool.text.FilterRegexString"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.FilterRegexString`

**Namespace:** `nodetool.text`

## Description

Filters a stream of strings using regular expressions.
    filter, regex, pattern, text, stream

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `str` | Input string stream | `` |
| pattern | `str` | The regular expression pattern to match against. | `` |
| full_match | `bool` | Whether to match the entire string or find pattern anywhere in string | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
