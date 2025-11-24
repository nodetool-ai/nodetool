---
layout: page
title: "Get Close Matches"
node_type: "lib.difflib.GetCloseMatches"
namespace: "lib.difflib"
---

**Type:** `lib.difflib.GetCloseMatches`

**Namespace:** `lib.difflib`

## Description

Finds close matches for a word within a list of possibilities.
    difflib, fuzzy, match

    Use cases:
    - Suggest alternatives for misspelled words
    - Map user input to valid options
    - Provide recommendations based on partial text

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| word | `str` | Word to match | `` |
| possibilities | `List[str]` | List of possible words | `[]` |
| n | `int` | Maximum number of matches to return | `3` |
| cutoff | `float` | Minimum similarity ratio | `0.6` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[str]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.difflib](../) namespace.

