---
layout: page
title: "Timeline"
node_type: "nodetool.constant.Timeline"
namespace: "nodetool.constant"
---

**Type:** `nodetool.constant.Timeline`

**Namespace:** `nodetool.constant`

## Description

References a timeline sequence in the workflow.
    timeline, video editor, sequence, clips, tracks

    Use cases:
    - Pass a timeline between nodes for video rendering or editing
    - Open and edit the referenced timeline in the timeline editor
    - Provide a fixed timeline input for downstream nodes

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `timeline` |  | `{"type":"timeline","id":null,"data":null}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `timeline` |  |

## Related Nodes

Browse other nodes in the [nodetool.constant](./) namespace.
