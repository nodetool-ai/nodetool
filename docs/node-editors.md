---
layout: page
title: "On-Canvas Node Editors"
permalink: /node-editors
description: "The interactive editors inside image, prompt, and code nodes on the workflow canvas: crop rectangles, layer stacks, histograms, paint surfaces, and the prompt composer."
---

Some nodes render an interactive editor as their body on the canvas: a crop rectangle, a layer stack, a histogram, a paint surface, a prompt composer, a code dialog. Every edit changes the node's ordinary properties, so the Inspector shows the same values. The one exception is noted under [Painter](#painter). Add the node from the node menu and the editor is its body. Builders who need property names and stored shapes can read [Node Editor Properties]({{ '/developer/node-editor-properties' | relative_url }}).

---

## How these editors behave

- **Previews show the node's output.** Most editors preview the result the server last produced, so the preview updates when you run the node or the workflow. [Crop](#crop) previews the incoming image instead, because you are choosing a region of it.
- **Slider drags are live, and release commits.** Dragging a slider writes the value as you go. Releasing the slider records one undo step for the whole drag.
- **Input handles stay on the left edge.** You connect images and masks to the same handles as on any node.
- **Reset buttons** return the editor's controls to their defaults in one undoable step.

---

## Compositor

**Node:** Compositor

Stacks several images into one. The node body shows the composited result on top and one row per layer below it.

| Control | What it does |
|---|---|
| Layer thumbnail | Shows the image connected to that layer |
| Opacity slider | Sets the layer's opacity from 0 to 1 |
| Blend mode dropdown | Sets how the layer combines with the ones below |
| Show or hide button | Turns the layer on or off without disconnecting it |
| Delete button | Removes the layer, its input handle, and any connection into it |
| **layer** add button | Adds a layer and a new input handle |

Each layer has its own input handle, numbered in order.

### Layout editor

The **Edit layout** button at the bottom of the node opens a larger window with a live preview. The preview uses your graphics card when the browser supports it and draws the layers a simpler way when it does not, so the window works in any browser.

- **Canvas size:** **Width** and **Height** set the output size. If you leave them unset, the size follows the first layer's image, or 512 by 512.
- **Stage:** Select a layer, then drag its body to move it, drag a corner or edge handle to scale it, and drag the top handle to rotate it.
- **Selected layer:** Fields for **X**, **Y**, **Scale X**, **Scale Y**, and **Rotation°**. Scale ranges from 0.02 to 64 and rotation from -360 to 360 degrees. The reset button ("Reset transform") puts the layer back at its default placement on the canvas.
- **Layers:** The same opacity, blend mode, visibility, delete, and add controls as on the node.

---

## Crop

**Node:** Crop

Choose a region of an image by dragging a rectangle over it.

- Drag the **interior** to move the rectangle.
- Drag any of the **four corners** or **four edges** to resize it.
- A rule-of-thirds grid shows inside the rectangle.
- **Aspect** locks the ratio while you resize. Options are Free, 1:1 Square, 4:3, 3:2, 16:9, 3:4, 2:3, and 9:16. Choosing a ratio resizes the rectangle height from its current width.
- **Size** shows the width and height in pixels. You can type into either. With an aspect locked, changing one changes the other.
- **Reset crop** selects the whole image.

The preview shows the image arriving on the image input. If the input is not connected, it shows the image set on the node itself, and after a run it falls back to the node's own result.

The crop is measured in pixels of the source image. The aspect choice is not saved with the node.

---

## Levels

**Node:** Levels

Adjusts tonal range per color channel, with a histogram of the node's output above the controls.

- **Histogram:** The **R**, **G**, **B**, and **L** (luminance) toggle picks which histogram to draw.
- **Channel:** **R**, **G**, or **B** picks the channel the three sliders edit.
- **Black:** the input black point, 0 to 255.
- **Gamma:** the midtone curve, 0.1 to 10. 1.00 is neutral.
- **White:** the input white point, 0 to 255.
- **Reset levels** restores black 0, gamma 1, white 255 on all three channels.

---

## Curves

**Node:** Curves

A slider-based tone control, not a drawn curve. Two groups sit under the preview.

| Group | Slider | Range |
|---|---|---|
| Tonal | Black point | 0 to 0.5 |
| Tonal | White point | 0.5 to 1 |
| Tonal | Shadows | -0.5 to 0.5 |
| Tonal | Midtones | -0.5 to 0.5 |
| Tonal | Highlights | -0.5 to 0.5 |
| RGB Midtones | Red | -0.5 to 0.5 |
| RGB Midtones | Green | -0.5 to 0.5 |
| RGB Midtones | Blue | -0.5 to 0.5 |

Signed sliders fill outward from the center, and a thumb lights up when its value differs from the default. **Reset all curves** returns every slider to its default (Black point 0, White point 1, the rest 0).

---

## Mask

**Node:** Mask

Composites two images through a mask. The node has three image inputs, **Image1**, **Image2**, and **Mask**, and no controls. The preview has four tabs: **Img 1**, **Img 2**, **Mask**, and **Result**. The first three show what is connected to each input, and **Result** shows the node's output. Use the tabs to check that each input is what you expect before running.

---

## Painter

**Node:** Painter

Paint a mask directly on an image. The node outputs the painted layer as a mask.

- **Source:** Connect an image to the image input, or drop an image file onto the paint area. A dropped file is added to your assets, becomes the node's image, and sets the canvas size to the picture's size. With no image the canvas is a blank 512 by 512.
- **Tools:** **Brush** and **Eraser**, plus a color swatch (**Brush color**, default white).
- **Size** (1 to 256 pixels, default 24) and **Opacity** (0 to 1, default 1) control the brush. Overlapping strokes within one stroke do not stack opacity.
- **Background opacity** (0 to 1) fades the source image behind your strokes so you can see the paint alone.
- **Canvas width** and **Canvas height** (1 to 4096) set the paint size when no image is connected.
- **Undo**, **Redo**, and **Clear painted mask**. The editor keeps the last 30 states.

The painted pixels are saved with the node. The brush tool, size, opacity, color, and background opacity are editor settings only. They are not saved with the node.

---

## Chroma key

**Node:** Chroma Key

Removes a background color. The body shows the preview, a **Key Color** picker, and three sliders.

| Control | Range | Default |
|---|---|---|
| Key Color | Any color | Green (`#00ff00`) |
| Tolerance | 0 to 1 | 0.1 |
| Softness | 0 to 1 | 0.05 |
| Spill | 0 to 1 | 0.5 |

---

## Prompt Composer

**Node:** Prompt

A prompt editor with inline references. The text box reads "Write a prompt… @ to mention an asset".

- **Mention an asset or entity:** Type `@`. A picker opens with **Recent** and **Saved** tabs of assets, plus an **Entities** group when you have library entities. Choosing one inserts a chip.
- **Drop an asset:** Drag an asset from the asset browser into the text. It becomes a chip at the drop point.
- **Insert a variable:** The bar under the text has one `{{ name }}` chip per available variable. Click one to insert it at the cursor. Chips come from the node's own inputs first, then from variables set by Set Variable nodes anywhere in the workflow.
- **Add a variable input:** The variable add button creates a new input for the node. Each input also gets an output handle that passes its value through.

Chips are replaced before the prompt is used:

| Chip | What happens at run time |
|---|---|
| Asset | The image or audio is sent to the model in place of the chip |
| Entity | The entity's description and reference image are added |
| Variable | The value of the node input or workflow variable is filled in |

Every keystroke updates the prompt right away, so a run always uses the current text. You can also type `{{ name }}` by hand.

---

## Code assistant

**Node:** Code

The Code node's **Ask AI** button (the sparkle icon in the node toolbar) opens the **Code assistant**, a large dialog for writing the node's code with the agent. The palette and the handle context menus can also start it, which creates a Code node for the dialog to edit.

The dialog has two sides:

- **Left:** the node title, **Inputs** and **Outputs** chips (`name: type`), and a JavaScript editor holding a draft of the code.
- **Right:** a chat panel, resizable by its edge. Ask in plain language, for example "merge the two lists on id" or "add an error output".

The agent edits the draft, not the node. It reads the draft and the declared ports, replaces the code, and declares input and output handles. It can also validate the code, run it with sample inputs, and test it. You see its edits appear in the editor. You can type in the editor too.

| Button | Result |
|---|---|
| **Apply** | Writes the draft code to the node and updates its inputs, their values, and its outputs in one undoable step. Inputs and outputs the node already had keep their value |
| **Cancel** | Leaves the node unchanged. If the dialog started from the palette or a handle menu and nothing was applied, the node it created is removed and any connection it displaced is restored |

The code runs in a sandbox. Declared inputs are available to the code, and the values it returns become output handles. See [JavaScript Sandbox](javascript-sandbox.md) for what the sandbox allows.

---

## Other bodies

These nodes also have their own bodies. Controls are sliders and number fields unless noted, and each changes the property of the same name.

| Node | What the body adds |
|---|---|
| Blur | Type dropdown (Gaussian, Box, Motion) and a size slider |
| Channels | R, G, B, A, and Luminance selector over the preview |
| Canvas Resize | Mode toggle for fixed, scale, or padding, with a dashed outline of the source on the new canvas |
| Fit | Width and height fields, size presets of 256, 512, 768, and 1024 |
| Resize | Width and height fields with an aspect lock |
| Resize Image | One body for scale, resize, and fit behind a mode toggle |
| Scale | A 0 to 10 scale slider and a resulting-size badge |
| Paste | Left and Top fields, with an outline of the paste rectangle over the base image |
| Rotate & Flip | Free-rotate slider with snap marks at 0, 90, 180, and 270, plus flip toggles and reset |
| HSLAdjust | Color-range dropdown with hue, saturation, and luminance sliders |
| Color Overlay, Drop Shadow, Outline | Color picker with amount, offset, radius, intensity, width, or threshold sliders |
| Offset, Pad | Offset sliders with a Clamp, Repeat, Mirror toggle. Pad has four edge sliders and a fill color |
| Invert, Convert To Grayscale | A Before and After toggle on the preview |
| Gradient, Checkerboard, and Gaussian Noise generators | Color pickers and sliders for each generator property |
| Background-removal nodes from Replicate and fal | **Image** and **Mask** preview tabs and a **Recalculate Mask** button |
| Many other color, color grading, filter, enhance, keyer, and warp nodes | A shared slider body that builds one slider for each numeric property |
| Asset Collection | A tray where you drop media to curate a list that streams downstream |
| Extract Video Frame | Video preview with frame stepping and a frame field that sets the time |
| List Generator | A live numbered list of generated items |
| Get Variable | A picker of variables published by Set Variable nodes |
| Sketch, Timeline (constant nodes) | A preview of the sketch or timeline with the node's fields beneath it |

---

## Related

- [Workflow Editor](workflow-editor.md) for the canvas
- [Sketch Editor](sketch-editor.md) for full layered painting outside a node
- [JavaScript Sandbox](javascript-sandbox.md) for what Code node code can do
