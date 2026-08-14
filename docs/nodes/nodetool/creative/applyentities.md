---
layout: page
title: "Apply Entities"
node_type: "nodetool.creative.ApplyEntities"
namespace: "nodetool.creative"
---

**Type:** `nodetool.creative.ApplyEntities`

**Namespace:** `nodetool.creative`

## Description

Inject reusable entity descriptors into a prompt for cross-shot consistency.
    creative, entities, consistency, prompt, references

    Use cases:
    - Keeping a character or style consistent across shots
    - Appending canonical descriptors to a shot prompt
    - Collecting reference images for a generation call

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` | The prompt to inject entities into. Empty text applies every entity. | `` |
| entities | `list[dict]` | Entities whose descriptors and reference images are injected. | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| prompt | `str` |  |
| reference_images | `list[image]` |  |

## Related Nodes

Browse other nodes in the [nodetool.creative](./) namespace.
