---
layout: page
title: "Load Entity"
node_type: "nodetool.entity.LoadEntity"
namespace: "nodetool.entity"
---

**Type:** `nodetool.entity.LoadEntity`

**Namespace:** `nodetool.entity`

## Description

Read one entity from the library, by picker or by name.
    entity, character, location, style, prop, library, load

    Use cases:
    - Feed a character's descriptor into a prompt
    - Pull an entity's reference image into a generator
    - Look an entity up by name inside a batch

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| entity | `entity` | The entity to load. Takes precedence over Name. | - |
| name | `str` | Look the entity up by name when no entity is picked. | `` |
| kind | `str` | Narrow a name lookup to one kind. Blank matches any kind. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| entity | `entity` |  |
| descriptor | `str` |  |
| name | `str` |  |
| kind | `str` |  |
| reference_image | `image` |  |
| voice_id | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.entity](./) namespace.
