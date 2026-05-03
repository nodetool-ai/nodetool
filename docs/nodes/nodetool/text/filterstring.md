---
layout: page
title: "Filter String"
node_type: "nodetool.text.FilterString"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.FilterString`

**Namespace:** `nodetool.text`

## Description

Filters a stream of strings based on various criteria.
    filter, strings, text, stream

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `str` | Input string stream | `` |
| filter_type | `enum` | The type of filter to apply | `contains` |
| criteria | `str` | The filtering criteria (text to match or length as string) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
