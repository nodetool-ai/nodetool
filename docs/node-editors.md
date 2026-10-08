---
layout: page
title: "On-Canvas Node Editors"
permalink: /node-editors
description: "The interactive editors that render inside image, prompt, and code nodes on the workflow canvas, and how each edit maps to node properties."
---

Many image nodes do not show a plain list of fields. They show a preview and controls made for the job: a crop rectangle you drag, a layer stack, a histogram, a paint surface. These editors render inside the node on the canvas. A few also open a larger window. The Prompt node has a composer with inline asset and variable chips, and the Code node has an AI-assisted code dialog.

Every edit writes to the node's ordinary properties, so the Inspector, saved workflows, and the API see the same values. Nothing here is hidden state, with the exceptions noted under [Painter](#painter).

> **Quick Access:** Add the node from the node menu, or select one already on the canvas. The editor is the node's body.

---

## How these editors behave

- **Previews show the node's output.** Most editors preview the result the server last produced, so the preview updates when you run the node or the workflow. [Crop](#crop) previews the incoming image instead, because you are choosing a region of it.
- **Slider drags are live, and release commits.** Dragging a slider writes the value as you go. Releasing the slider records one undo step for the whole drag.
- **Input handles stay on the left edge.** You connect images and masks to the same handles as on any node.
- **Reset buttons** return the editor's controls to their defaults in one undoable step.

For the canvas itself, see [Workflow Editor](workflow-editor.md).

---

## Compositor

**Node:** `nodetool.image.Compositor`

Stacks several images into one. The node body shows the composited result on top and one row per layer below it.

| Control | What it does | Stored as |
|---|---|---|
| Layer thumbnail | Shows the image connected to that layer | Not stored. It follows the connection |
| Opacity slider | Sets the layer's opacity from 0 to 1 | `layers[i].opacity` |
| Blend mode dropdown | Sets how the layer combines with the ones below | `layers[i].blend_mode` |
| Show or hide button | Turns the layer on or off without disconnecting it | `layers[i].visible` |
| Delete button | Removes the layer, its input handle, and any edge into it | Removes `image_N` and `layers[i]` |
| **layer** add button | Adds a layer and a new input handle named `image_N` | Adds `image_N` and a default `layers` entry |

Each layer is a dynamic input named `image_1`, `image_2`, and so on. The `layers` property is a list of objects that lines up by position with the sorted `image_N` inputs.

### Layout editor

The edit button at the bottom of the node (tooltip "Open layout editor") opens a larger window with a live preview. It needs WebGPU. Without it the window shows "WebGPU unavailable" and the node still composites on the server.

- **Canvas size:** **Width** and **Height** set the output size. They write `canvas_width` and `canvas_height`. If unset, the size follows the first layer's image, or 512 by 512.
- **Stage:** Select a layer, then drag its body to move it, drag a corner or edge handle to scale it, and drag the top handle to rotate it.
- **Selected layer:** Fields for **X**, **Y**, **Scale X**, **Scale Y**, and **Rotation°**. Scale ranges from 0.02 to 64 and rotation from -360 to 360 degrees. The reset button ("Reset transform") puts the layer back at its default placement on the canvas.
- **Layers:** The same opacity, blend mode, visibility, delete, and add controls as on the node.

A layer you have never moved has no `transform`. Once you move, scale, or rotate it, its `layers[i].transform` holds `x`, `y`, `scaleX`, `scaleY`, and `rotation`.

---

## Crop

**Node:** `nodetool.image.Crop`

Choose a region of an image by dragging a rectangle over it.

- Drag the **interior** to move the rectangle.
- Drag any of the **four corners** or **four edges** to resize it.
- A rule-of-thirds grid shows inside the rectangle.
- **Aspect** locks the ratio while you resize. Options are Free, 1:1 Square, 4:3, 3:2, 16:9, 3:4, 2:3, and 9:16. Choosing a ratio resizes the rectangle height from its current width.
- **Size** shows the width and height in pixels. You can type into either. With an aspect locked, changing one changes the other.
- **Reset crop** selects the whole image.

The preview shows the image arriving on the `image` input. If the input is not connected, it shows the node's constant `image` value, and after a run it falls back to the node's own result.

**Stored as:** `left`, `top`, `right`, `bottom`, in source pixels. Width and height are derived (`right - left`, `bottom - top`). The aspect choice is not stored.

---

## Levels

**Node:** `nodetool.image.Levels`

Adjusts tonal range per color channel, with a histogram of the node's output above the controls.

- **Histogram:** The **R**, **G**, **B**, and **L** (luminance) toggle picks which histogram to draw.
- **Channel:** **R**, **G**, or **B** picks the channel the three sliders edit.
- **Black:** the input black point, 0 to 255.
- **Gamma:** the midtone curve, 0.1 to 10. 1.00 is neutral.
- **White:** the input white point, 0 to 255.
- **Reset levels** restores black 0, gamma 1, white 255 on all three channels.

**Stored as:** `r_black`, `r_gamma`, `r_white`, `g_black`, `g_gamma`, `g_white`, `b_black`, `b_gamma`, `b_white`.

---

## Curves

**Node:** `lib.image.color_grading.Curves`

A slider-based tone control, not a drawn curve. Two groups sit under the preview.

| Group | Slider | Stored as | Range |
|---|---|---|---|
| Tonal | Black Point | `black_point` | 0 to 0.5 |
| Tonal | White Point | `white_point` | 0.5 to 1 |
| Tonal | Shadows | `shadows` | -0.5 to 0.5 |
| Tonal | Midtones | `midtones` | -0.5 to 0.5 |
| Tonal | Highlights | `highlights` | -0.5 to 0.5 |
| RGB Midtones | Red | `red_midtones` | -0.5 to 0.5 |
| RGB Midtones | Green | `green_midtones` | -0.5 to 0.5 |
| RGB Midtones | Blue | `blue_midtones` | -0.5 to 0.5 |

Signed sliders fill outward from the center, and a thumb lights up when its value differs from the default. **Reset all curves** returns every slider to its default (Black Point 0, White Point 1, the rest 0).

---

## Mask

**Node:** `lib.image.Mask`

Composites two images through a mask. The node has three image inputs, `image1`, `image2`, and `mask`, and no controls. The preview has four tabs: **Img 1**, **Img 2**, **Mask**, and **Result**. The first three show what is connected to each input, and **Result** shows the node's output. Use the tabs to check that each input is what you expect before running.

---

## Painter

**Node:** `nodetool.image.Painter`

Paint a mask directly on an image. The node outputs the painted layer as a `mask`.

- **Source:** Connect an image to `image`, or drop an image file onto the paint area. A dropped file uploads as an asset, becomes the node's `image`, and sets the canvas size to the picture's size. With no image the canvas is a blank 512 by 512.
- **Tools:** **Brush** and **Eraser**, plus a color swatch (**Brush color**, default white).
- **Size** (1 to 256 pixels, default 24) and **Opacity** (0 to 1, default 1) control the brush. Overlapping strokes within one stroke do not stack opacity.
- **Background opacity** (0 to 1) fades the source image behind your strokes so you can see the paint alone.
- **Canvas width** and **Canvas height** (1 to 4096) set the paint size when no image is connected.
- **Undo**, **Redo**, and **Clear painted mask**. The editor keeps the last 30 states.

**Stored as:** The painted pixels are saved as a base64 PNG in `mask_data`. Dropping an image sets `image`, `canvas_width`, and `canvas_height`. The brush tool, size, opacity, color, and background opacity are editor settings. This body does not write them back to the node.

---

## Chroma key

**Node:** `lib.image.keyer.ChromaKey`

Removes a background color. The body shows the preview, a **Key Color** picker, and three sliders.

| Control | Stored as | Range | Default |
|---|---|---|---|
| Key Color | `key_color` | Any color | `#00ff00` |
| Tolerance | `tolerance` | 0 to 1 | 0.1 |
| Softness | `softness` | 0 to 1 | 0.05 |
| Spill | `spill` | 0 to 1 | 0.5 |

`key_color` is stored as a color value (`{ "type": "color", "value": "#00ff00" }`).

---

## Prompt Composer

**Node:** `nodetool.text.Prompt`

A prompt editor with inline references. The text box reads "Write a prompt… @ to mention an asset".

- **Mention an asset or entity:** Type `@`. A picker opens with **Recent** and **Saved** tabs of assets, plus an **Entities** group when you have library entities. Choosing one inserts a chip.
- **Drop an asset:** Drag an asset from the asset browser into the text. It becomes a chip at the drop point.
- **Insert a variable:** The bar under the text has one `{{ name }}` chip per available variable. Click one to insert it at the cursor. Chips come from the node's own inputs first, then from variables set by Set Variable nodes anywhere in the workflow.
- **Add a variable input:** The variable add button creates a dynamic input named `var_1`, `var_2`, and so on. Each input also gets an output handle that passes its raw value through.

**Stored as:** `prompt` holds plain text. Chips are only how the editor draws it:

| Chip | Stored text | Resolved |
|---|---|---|
| Asset | `asset://<id>.<ext>` | Replaced with the image or audio content before the prompt reaches a provider |
| Entity | `entity://<id>` | Expanded at generation time into the entity's description and reference image |
| Variable | `{{ name }}` | Replaced from the node's input or the workflow variable at run time |

Every keystroke writes `prompt` right away, so a run always sends the current text. Because the stored value is plain text, you can also type `{{ name }}` or `asset://...` by hand.

---

## Code assistant

**Node:** `nodetool.code.Code`

The Code node's **Ask AI** button (the sparkle icon in the node toolbar) opens the **Code assistant**, a large dialog for writing the node's code with the agent. The palette and the handle context menus can also start it, which creates a Code node for the dialog to edit.

The dialog has two sides:

- **Left:** the node title, **Inputs** and **Outputs** chips (`name: type`), and a JavaScript editor holding a draft of the code.
- **Right:** a chat panel, resizable by its edge. Ask in plain language, for example "merge the two lists on id" or "add an error output".

The agent edits the draft, not the node. It reads the draft and the declared ports, replaces the code, and declares input and output handles. It can also validate the code, run it with sample inputs, and test it. You see its edits appear in the editor. You can type in the editor too.

| Button | Result |
|---|---|
| **Apply** | Writes the draft code to the node's `code` property and updates the node's dynamic inputs, their values, and its dynamic outputs, all in one undoable step. Ports the node already had keep their value |
| **Cancel** | Leaves the node unchanged. If the dialog started from the palette or a handle menu and nothing was applied, the node it created is removed and any edge it displaced is restored |

The code runs in a sandbox. Declared inputs arrive on an `inputs` object, and the keys of the returned object become output handles. See [JavaScript Sandbox](javascript-sandbox.md) for what the sandbox allows.

---

## Other bodies

These nodes also have their own bodies. Controls are sliders and number fields unless noted, and each writes the property named for it.

| Node type | What the body adds |
|---|---|
| `nodetool.image.Blur` | Type dropdown (Gaussian, Box, Motion) and a size slider |
| `nodetool.image.Channels` | R, G, B, A, and Luminance selector over the preview |
| `nodetool.image.CanvasResize` | Mode toggle for fixed, scale, or padding, with a dashed outline of the source on the new canvas |
| `nodetool.image.Fit` | Width and height fields, size presets of 256, 512, 768, and 1024 |
| `nodetool.image.Resize` | Width and height fields with an aspect lock |
| `nodetool.image.ResizeImage` | One body for scale, resize, and fit behind a mode toggle |
| `nodetool.image.Scale` | A 0 to 10 scale slider and a resulting-size badge |
| `nodetool.image.Paste` | Left and Top fields, with an outline of the paste rectangle over the base image |
| `nodetool.image.RotateAndFlip` | Free-rotate slider with snap marks at 0, 90, 180, and 270, plus flip toggles and reset |
| `lib.image.color_grading.HSLAdjust` | Color-range dropdown with hue, saturation, and luminance sliders |
| `lib.image.effects.ColorOverlay`, `DropShadow`, `Outline` | Color picker with amount, offset, radius, intensity, width, or threshold sliders |
| `lib.image.warp.Offset`, `Pad` | Offset sliders with a Clamp, Repeat, Mirror toggle. Pad has four edge sliders and a fill color |
| `lib.image.filter.Invert`, `ConvertToGrayscale` | A Before and After toggle on the preview |
| Gradient, Checkerboard, and Gaussian noise generators in `lib.image.draw` | Color pickers and sliders for each generator property |
| Background-removal nodes from Replicate and fal | **Image** and **Mask** preview tabs and a **Recalculate Mask** button |
| Many other `lib.image.color`, `color_grading`, `filter`, `enhance`, `keyer`, and `warp` nodes | A shared slider body that builds one slider for each numeric property |
| `nodetool.control.Collection` | A tray where you drop media to curate a list that streams downstream |
| `nodetool.video.ExtractFrame` | Video preview with frame stepping and a frame field that writes `time` |
| `nodetool.generators.ListGenerator` | A live numbered list of generated items |
| `nodetool.variable.GetVariable` | A picker of variables published by Set Variable nodes |
| `nodetool.constant.Sketch`, `nodetool.constant.Timeline` | A preview of the sketch or timeline with the node's fields beneath it |

---

## Related

- [Workflow Editor](workflow-editor.md) for the canvas
- [Sketch Editor](sketch-editor.md) for full layered painting outside a node
- [JavaScript Sandbox](javascript-sandbox.md) for what Code node code can do
