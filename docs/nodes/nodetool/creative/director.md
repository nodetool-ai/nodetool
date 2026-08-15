---
layout: page
title: "Director"
node_type: "nodetool.creative.Director"
namespace: "nodetool.creative"
---

**Type:** `nodetool.creative.Director`

**Namespace:** `nodetool.creative`

## Description

Turn a creative brief into a structured screenplay of shots using an LLM.
    creative, director, screenplay, shots, storyboard

    Use cases:
    - Planning a short film or ad from a one-line brief
    - Producing a shot list with camera direction and a consistent style
    - Seeding a storyboard/timeline pipeline with a typed screenplay

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model to use for directing the screenplay. | - |
| brief | `str` | The creative brief to turn into a screenplay. | `` |
| style | `str` | Optional style guidance applied across every shot. | `` |
| shot_count | `int` | How many shots the screenplay should contain. | `5` |
| aspect_ratio | `str` | Aspect ratio for the piece (e.g. 16:9, 9:16, 1:1). | `16:9` |
| max_tokens | `int` | The maximum number of tokens to generate. | `8192` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| screenplay | `dict` |  |
| narration | `str` |  |
| music_prompt | `str` |  |
| title | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.creative](./) namespace.
