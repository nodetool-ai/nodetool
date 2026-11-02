---
layout: page
title: "Element"
node_type: "nodetool.video.Element"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.Element`

**Namespace:** `nodetool.video`

## Description

A character or object for a video model to keep consistent, such as Kling Elements. Give a frontal image with up to three extra views, or a video. Name it and write @name in the prompt to refer to it, or connect an Entity to use its reference images and voice.
    video, element, character, object, reference, kling, consistency

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| name | `str` | How the prompt refers to this element, as @name. Without a name, use @Element1, @Element2 in connection order. | `` |
| frontal_image | `image` | A front view of the element. | - |
| reference_images | `list[image]` | Up to three more views from other angles. | `[]` |
| video | `video` | A 3 to 30 second video of the element, used instead of the images. | - |
| entity | `entity` | A library entity. Its reference images, name and voice fill whatever is left empty here. | null |
| voice_id | `str` | A provider voice id bound to the element, for models that voice elements. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video_element` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
