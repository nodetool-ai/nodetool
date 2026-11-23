---
layout: page
title: "Create Entity"
node_type: "nodetool.entity.CreateEntity"
namespace: "nodetool.entity"
---

**Type:** `nodetool.entity.CreateEntity`

**Namespace:** `nodetool.entity`

## Description

Add an entity to the library, or update the one this graph made last time.
    entity, library, create, upsert, batch

    Use cases:
    - Turn a product photo into a reusable entity per SKU
    - Register a generated character so later shots stay consistent
    - Re-run a catalog import without duplicating the library

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The reference image the entity shows. | - |
| kind | `str` | What the entity is. | `prop` |
| name | `str` | Display name, referenced from shot text. | `` |
| descriptor | `str` | The canonical visual description pasted into every prompt naming this entity. | `` |
| description | `str` | Longer notes, never injected into prompts. | `` |
| tags | `list[str]` | Tags stored on the entity for later filtering. | `[]` |
| voice_id | `str` | Provider voice id, for a character entity. | `` |
| key | `str` | Upsert identity (a SKU, say). A re-run with the same key updates its own entity instead of adding one. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| entity | `entity` |  |
| created | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.entity](./) namespace.
