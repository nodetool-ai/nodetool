---
layout: page
title: "Background"
node_type: "lib.pillow.draw.Background"
namespace: "lib.pillow.draw"
---

**Type:** `lib.pillow.draw.Background`

**Namespace:** `lib.pillow.draw`

## Description

The Background Node creates a blank background.
    image, background, blank, base, layer
    This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.

    #### Applications
    - As a base layer for creating composite images.
    - As a starting point for generating patterns or graphics.
    - When blank backgrounds of specific colors are required for visualization tasks.

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| width | `int` |  | `512` |
| height | `int` |  | `512` |
| color | `color` |  | `{'type': 'color', 'value': '#FFFFFF'}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.pillow.draw](../) namespace.

