---
layout: page
title: "Extract Regex Groups"
node_type: "nodetool.text.ExtractRegex"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.ExtractRegex`

**Namespace:** `nodetool.text`

## Description

Extracts substrings matching regex groups from text.
    text, regex, extract

    Use cases:
    - Extracting structured data (e.g., dates, emails) from unstructured text
    - Parsing specific patterns in log files or documents
    - Isolating relevant information from complex text formats

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| regex | `any` |  | `` |
| dotall | `any` |  | `False` |
| ignorecase | `any` |  | `False` |
| multiline | `any` |  | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

