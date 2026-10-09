---
layout: page
title: "Recast Storyboard"
node_type: "nodetool.storyboard.RecastStoryboard"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.RecastStoryboard`

**Namespace:** `nodetool.storyboard`

## Description

Copy an approved storyboard onto a new cast, keeping every frame whose prompt did not change.
    storyboard, recast, variant, batch, entities

    Use cases:
    - Re-running an approved board for another product
    - Swapping the actor or location in a template
    - Producing one variant per SKU without re-directing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| storyboard | `storyboard` | The template board to copy. It is never written. | - |
| cast | `list[entity]` | Entities to put in the copy. Each replaces the board entity named in `replaces`, or the board's single entity of the same kind. | `[]` |
| replaces | `list[str]` | Board entity id or name each cast member stands in for, in cast order. Leave an entry empty to infer it from the entity's kind. | `[]` |
| name | `str` | Name for the copy. Defaults to the template's name plus the new cast. | `` |
| reuse_existing | `bool` | Re-derive the copy this mapping made last time instead of creating a second one, so a re-run pays only for what changed. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| storyboard | `storyboard` |  |
| invalidated | `list[str]` |  |
| kept | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.
