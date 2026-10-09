---
layout: page
title: "Create Storyboard"
node_type: "nodetool.storyboard.CreateStoryboard"
namespace: "nodetool.storyboard"
---

**Type:** `nodetool.storyboard.CreateStoryboard`

**Namespace:** `nodetool.storyboard`

## Description

Save a Director screenplay as a storyboard you can open, edit and render.
    storyboard, create, screenplay, director, shots, board

    Use cases:
    - Turning a brief into a board: Director -> Create Storyboard -> Render Stills
    - Handing a generated shot list to a person for review in the board editor
    - Casting library entities into a new board

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| screenplay | `dict` | The screenplay to save, usually from the Director node. | `{}` |
| name | `str` | Board name. Defaults to the screenplay's title. With reuse_existing it is also the board's identity across runs. | `` |
| brief | `str` | The brief the board was directed from, shown in the board editor. | `` |
| cast | `list[entity]` | Library entities the board's shots are seasoned with. A shot that names an entity gets its descriptor and reference image when rendered. | `[]` |
| image_model | `image_model` | The board's still model. Render Stills uses it unless its own input overrides it. | - |
| video_model | `video_model` | The board's clip model. Render Clips uses it unless its own input overrides it. | - |
| project | `str` | Project to create the board in. Empty uses the default project. | `` |
| reuse_existing | `bool` | Return the board this node made under the same name last run instead of creating another, so a re-run renders only what is stale. | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| storyboard | `storyboard` |  |
| shots | `list[dict]` |  |
| shot_count | `int` |  |
| created | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.storyboard](./) namespace.
