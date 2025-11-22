---
layout: page
title: "Slice Text"
node_type: "nodetool.text.Slice"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Slice`

**Namespace:** `nodetool.text`

## Description

Slices text using Python's slice notation (start:stop:step).
    text, slice, substring

    Use cases:
    - Extracting specific portions of text with flexible indexing
    - Reversing text using negative step
    - Taking every nth character with step parameter

    Examples:
    - start=0, stop=5: first 5 characters
    - start=-5: last 5 characters
    - step=2: every second character
    - step=-1: reverse the text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| start | `any` |  | - |
| stop | `any` |  | - |
| step | `any` |  | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

