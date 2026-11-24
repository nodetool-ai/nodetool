---
layout: page
title: "Fill Script"
node_type: "nodetool.script.FillScript"
namespace: "nodetool.script"
---

**Type:** `nodetool.script.FillScript`

**Namespace:** `nodetool.script`

## Description

Fill a template script's {{key}} placeholders from a value bag and save the result as a new script. The template is never written. A key with no value stays in the text and is reported, and every take is kept, so a later Voice Script pays only for the lines whose text moved.
    script, template, fill, placeholder, batch

    Use cases:
    - Produce one script per row of a product feed
    - Localize a template by swapping its values
    - Re-run a batch and re-voice only what changed

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| script | `script` | The template script to fill. | - |
| values | `dict` | Value per placeholder key, e.g. {name: "Aero 9"}. | `{}` |
| name | `str` | Name for the new script. Defaults to the template's name. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| script | `script` |  |
| filled | `list[str]` |  |
| unresolved | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.script](./) namespace.
