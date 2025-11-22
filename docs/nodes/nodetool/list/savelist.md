---
layout: page
title: "Save List"
node_type: "nodetool.list.SaveList"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.SaveList`

**Namespace:** `nodetool.list`

## Description

Saves a list to a text file, placing each element on a new line.
    list, save, file, serialize

    Use cases:
    - Export list data to a file
    - Create a simple text-based database
    - Generate line-separated output

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` |  | `[]` |
| name | `any` | 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `text.txt` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

