---
layout: page
title: "Stage Game Assets"
node_type: "nodetool.game.StageGameAssets"
namespace: "nodetool.game"
---

**Type:** `nodetool.game.StageGameAssets`

**Namespace:** `nodetool.game`

## Description

Validate generated media and stage candidate bindings for a native game.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| template | `str` |  | `topdown` |
| game_id | `str` |  | `` |
| fills | `list[union[image,audio]]` |  | `[]` |
| preparation | `dict` |  | `{}` |
| reference_asset_id | `str` |  | `` |
| fonts | `dict` |  | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `dict` |  |
| bindings | `dict` |  |
| paths | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.game](./) namespace.
