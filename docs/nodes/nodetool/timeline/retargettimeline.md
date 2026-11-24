---
layout: page
title: "Retarget Timeline"
node_type: "nodetool.timeline.RetargetTimeline"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.RetargetTimeline`

**Namespace:** `nodetool.timeline`

## Description

Derive a new timeline from an approved cut on another aspect ratio, keeping every trim, placement and edit. Cover scales each shot to fill the new frame and reports the clips it crops; contain letterboxes instead. Text sizes follow the short edge. The source cut is never written.
    timeline, aspect ratio, resize, reframe, variant

    Use cases:
    - Turn a 16:9 film into 9:16 and 1:1 cuts
    - Produce every placement's ratio from one approved edit
    - See which shots lose their sides before rendering

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | The approved cut to retarget. | - |
| aspect_ratio | `str` | Target ratio, e.g. 9:16, 1:1, 4:5. The short edge is 1080px. | `9:16` |
| fit | `enum` | cover fills the new frame and crops; contain fits it and letterboxes. | `cover` |
| name | `str` | Name for the new timeline. Defaults to the source's name plus the ratio. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| timeline | `timeline` |  |
| cropped | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
