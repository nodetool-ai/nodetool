---
layout: page
title: "Fill Timeline Text"
node_type: "nodetool.timeline.FillTimelineText"
namespace: "nodetool.timeline"
---

**Type:** `nodetool.timeline.FillTimelineText`

**Namespace:** `nodetool.timeline`

## Description

Fill a template cut's {{key}} placeholders — in text clips and in captions — from a value bag, and save the result as a new timeline. The template is never written. A key with no value stays in the frame and is reported.
    timeline, template, text, fill, batch

    Use cases:
    - Stamp a per-SKU name and price onto an approved cut
    - Localize an overlay without re-editing the timeline
    - Produce one variant per row of a feed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeline | `timeline` | The template cut to fill. | - |
| values | `dict` | Value per placeholder key, e.g. {name: "Aero 9"}. | `{}` |
| name | `str` | Name for the new timeline. Defaults to the template's name. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| timeline | `timeline` |  |
| filled | `list[str]` |  |
| unresolved | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.timeline](./) namespace.
