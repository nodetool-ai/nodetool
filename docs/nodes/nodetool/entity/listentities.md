---
layout: page
title: "List Entities"
node_type: "nodetool.entity.ListEntities"
namespace: "nodetool.entity"
---

**Type:** `nodetool.entity.ListEntities`

**Namespace:** `nodetool.entity`

## Description

List entities from the library, filtered by kind, tags, name or project.
    entity, library, list, cast, batch

    Use cases:
    - Fan a graph out over every product in a project
    - Collect a cast to pass into a generator
    - Find the entities carrying one tag

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| kind | `str` | Only entities of this kind. Blank matches any kind. | `` |
| tags | `list[str]` | Only entities carrying these tags. | `[]` |
| name_contains | `str` | Only entities whose name contains this text. | `` |
| project | `str` | Only entities in this project. Blank searches the whole library. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| entity | `entity` |  |
| entities | `list[entity]` |  |

## Related Nodes

Browse other nodes in the [nodetool.entity](./) namespace.
