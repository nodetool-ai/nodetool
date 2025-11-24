---
layout: page
title: "Unified Diff"
node_type: "lib.difflib.UnifiedDiff"
namespace: "lib.difflib"
---

**Type:** `lib.difflib.UnifiedDiff`

**Namespace:** `lib.difflib`

## Description

Generates a unified diff between two texts.
    difflib, diff, compare

    Use cases:
    - Display differences between versions of text files
    - Highlight changes in user submitted documents
    - Compare code snippets

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| a | `str` | Original text | `` |
| b | `str` | Modified text | `` |
| fromfile | `str` | Name of the original file | `a` |
| tofile | `str` | Name of the modified file | `b` |
| lineterm | `str` | Line terminator | `
` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.difflib](../) namespace.

