---
layout: page
title: "Save Text File"
node_type: "nodetool.text.SaveTextFile"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.SaveTextFile`

**Namespace:** `nodetool.text`

## Description

Saves input text to a file in the assets folder.
    text, save, file

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| folder | `any` | Path to the output folder. | `` |
| name | `any` | 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d-%H-%M-%S.txt` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

