---
layout: page
title: "Relative Path"
node_type: "lib.os.RelativePath"
namespace: "lib.os"
---

**Type:** `lib.os.RelativePath`

**Namespace:** `lib.os`

## Description

Return a relative path to a target from a start directory.
    files, path, relative

    Use cases:
    - Create relative path references
    - Generate portable paths
    - Compare file locations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| target_path | `str` | Target path to convert to relative | `` |
| start_path | `str` | Start path for relative conversion | `.` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.os](../) namespace.

