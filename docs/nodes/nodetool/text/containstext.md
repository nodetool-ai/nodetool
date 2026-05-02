---
layout: page
title: "Contains Text"
node_type: "nodetool.text.Contains"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Contains`

**Namespace:** `nodetool.text`

## Description

Checks if text contains a specified substring.
    text, compare, validate, substring, string

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| substring | `str` |  | `` |
| search_values | `list[str]` | Optional list of additional substrings to check | `[]` |
| case_sensitive | `bool` |  | `true` |
| match_mode | `enum` | ANY requires one match, ALL needs every value, NONE ensures none | `any` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
