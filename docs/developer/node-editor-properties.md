---
layout: page
title: "Node Editor Properties"
description: "Node types, properties, and stored shapes behind the on-canvas node editors."
---

This page maps each on-canvas editor control to the node property it writes. For what the controls do, see [On-Canvas Node Editors](../node-editors.md).

Every editor writes the node's ordinary properties, so the Inspector, saved workflows, and the API see the same values.

## Compositor

Node type: `nodetool.image.Compositor` (title Compositor).

| Control | Property |
|---|---|
| Layer thumbnail | Not stored. It follows the connection |
| Opacity slider | `layers[i].opacity` |
| Blend mode dropdown | `layers[i].blend_mode` |
| Show or hide button | `layers[i].visible` |
| Delete button | Removes `image_N` and `layers[i]` |
| **layer** add button | Adds `image_N` and a default `layers` entry |
| Layout editor Width, Height | `canvas_width`, `canvas_height` |

Each layer is a dynamic input named `image_1`, `image_2`, and so on. The `layers` property is a list of objects that lines up by position with the sorted `image_N` inputs. A layer you have never moved has no `transform`. Once you move, scale, or rotate it, `layers[i].transform` holds `x`, `y`, `scaleX`, `scaleY`, and `rotation`.

## Crop

Node type: `nodetool.image.Crop`. Writes `left`, `top`, `right`, `bottom` in source pixels. Width and height are derived (`right - left`, `bottom - top`). The aspect choice is not stored. The preview uses the `image` input, then the constant `image` value, then the node's result after a run.

## Levels

Node type: `nodetool.image.Levels`. Writes `r_black`, `r_gamma`, `r_white`, `g_black`, `g_gamma`, `g_white`, `b_black`, `b_gamma`, `b_white`.

## Curves

Node type: `lib.image.color_grading.Curves`.

| Slider | Property | Range |
|---|---|---|
| Black point | `black_point` | 0 to 0.5 |
| White point | `white_point` | 0.5 to 1 |
| Shadows | `shadows` | -0.5 to 0.5 |
| Midtones | `midtones` | -0.5 to 0.5 |
| Highlights | `highlights` | -0.5 to 0.5 |
| Red | `red_midtones` | -0.5 to 0.5 |
| Green | `green_midtones` | -0.5 to 0.5 |
| Blue | `blue_midtones` | -0.5 to 0.5 |

## Mask

Node type: `lib.image.Mask`. Inputs are `image1`, `image2`, and `mask`. The body has no controls that write properties.

## Painter

Node type: `nodetool.image.Painter`. The painted pixels are saved as a base64 PNG in `mask_data`. Dropping an image file sets `image`, `canvas_width`, and `canvas_height`. The Canvas width and Canvas height fields also write `canvas_width` and `canvas_height`. The brush tool, size, opacity, color, and background opacity are editor state. The body does not write them to the node. This is the exception to the rule that every control writes a node property.

## Chroma key

Node type: `lib.image.keyer.ChromaKey`.

| Control | Property | Range | Default |
|---|---|---|---|
| Key Color | `key_color` | Any color | `{ "type": "color", "value": "#00ff00" }` |
| Tolerance | `tolerance` | 0 to 1 | 0.1 |
| Softness | `softness` | 0 to 1 | 0.05 |
| Spill | `spill` | 0 to 1 | 0.5 |

## Prompt Composer

Node type: `nodetool.text.Prompt`. The `prompt` property holds plain text. Chips are only how the editor draws it. Variable inputs are dynamic inputs named `var_1`, `var_2`, and so on, each with a pass-through output.

| Chip | Stored text | Resolved |
|---|---|---|
| Asset | `asset://<id>.<ext>` | Replaced with the image or audio content before the prompt reaches a provider |
| Entity | `entity://<id>` | Expanded at generation time into the entity's description and reference image |
| Variable | `{{ name }}` | Replaced from the node's input or the workflow variable at run time |

Every keystroke writes `prompt`, so a run always sends the current text. You can type `{{ name }}` or `asset://...` by hand.

## Code assistant

Node type: `nodetool.code.Code`. **Apply** writes the draft to the `code` property and updates the node's dynamic inputs, their values, and its dynamic outputs in one undoable step. Ports the node already had keep their value. Declared inputs arrive on an `inputs` object, and the keys of the returned object become output handles. See [JavaScript Sandbox](../javascript-sandbox.md).

## Other bodies

| Display title | Node type |
|---|---|
| Blur | `nodetool.image.Blur` |
| Channels | `nodetool.image.Channels` |
| Canvas Resize | `nodetool.image.CanvasResize` |
| Fit | `nodetool.image.Fit` |
| Resize | `nodetool.image.Resize` |
| Resize Image | `nodetool.image.ResizeImage` |
| Scale | `nodetool.image.Scale` |
| Paste | `nodetool.image.Paste` |
| Rotate & Flip | `nodetool.image.RotateAndFlip` |
| HSLAdjust | `lib.image.color_grading.HSLAdjust` |
| Color Overlay, Drop Shadow, Outline | `lib.image.effects.ColorOverlay`, `DropShadow`, `Outline` |
| Offset, Pad | `lib.image.warp.Offset`, `Pad` |
| Invert, Convert To Grayscale | `lib.image.filter.Invert`, `ConvertToGrayscale` |
| Gradient, Checkerboard, Gaussian Noise | `lib.image.draw` generators |
| Asset Collection | `nodetool.control.Collection` |
| Extract Video Frame | `nodetool.video.ExtractFrame` (frame field writes `time`) |
| List Generator | `nodetool.generators.ListGenerator` |
| Get Variable | `nodetool.variable.GetVariable` |
| Sketch, Timeline | `nodetool.constant.Sketch`, `nodetool.constant.Timeline` |

Many other `lib.image.color`, `color_grading`, `filter`, `enhance`, `keyer`, and `warp` nodes share one slider body that builds a slider for each numeric property.
