---
layout: page
title: "Image Editor"
description: "Professional image editing built into NodeTool workflows."
---

Edit images directly in NodeTool with a full-featured editor.

> **Quick Access:** Click the edit icon (✏️) on any image output or property to open the editor.

---

## Overview

The Image Editor is a layered, Photoshop-style raster editor built into NodeTool. Edit images inline and see results immediately.

**Features:**
- Layers with blend modes and per-layer opacity
- Unlimited undo/redo
- Painting tools: brush, pencil, eraser, fill, clone stamp, blur, gradient
- Selection tools: rectangular marquee, magic wand
- Shape tools: rectangle, ellipse, line, arrow
- Crop and free transform
- Eyedropper for sampling colors, swap/reset foreground/background colors
- Export the composited result as PNG back to your workflow

---

## Opening the Editor

### From Node Outputs

When a node outputs an image:
1. Look for the **edit icon (✏️)** on the image preview
2. Click to open the full editor

### From Node Properties

For image input properties:
1. Click the **edit icon** next to the image property
2. Opens the editor to prepare your input image

---

## Tools

The Image Editor includes multiple tools, selectable from the toolbar or by keyboard shortcut.

### Move Tool

**Shortcut:** `V`

Move the active layer (or selection contents). The default tool for repositioning content.

---

### Selection Tools

#### Rectangular Marquee

**Shortcut:** `M`

Drag to make a rectangular selection. Subsequent paint and edit operations are constrained to the selection. `Ctrl/⌘ + D` deselects.

#### Magic Wand

**Shortcut:** `W`

Click to select contiguous regions of similar color.

---

### Crop Tool

**Shortcut:** `C`

Resize and reframe your image.

1. Press `C` (or click the **Crop** tool).
2. Drag the corners and edges of the crop box.
3. Press `Enter` to commit, or `Esc` to cancel.

---

### Brush Tool

**Shortcut:** `B`

Paint freehand on the active layer.

**Settings:**
- **Size:** `[` decreases, `]` increases
- **Color:** uses the current foreground color
- **Opacity:** press a digit `1`–`0` for a preset (e.g. `5` = 50%, `0` = 100%)

A **Pencil** variant (`P`) paints hard-edged strokes.

---

### Eraser Tool

**Shortcut:** `E`

Erase pixels on the active layer. Shares the size and opacity controls with the brush.

---

### Fill Tool

**Shortcut:** `G`

Flood-fill contiguous regions with the foreground color.

---

### Gradient Tool

**Shortcut:** `T`

Drag to draw a gradient between the foreground and background colors. (There is no text tool in this editor.)

---

### Clone Stamp

**Shortcut:** `S`

Sample one part of the image and paint it elsewhere — useful for removing blemishes or duplicating detail. Set the source point first, then paint.

---

### Blur Tool

**Shortcut:** `Q`

Paint to soften and blur pixels under the brush.

---

### Eyedropper

**Shortcut:** `I`

Click anywhere on the canvas to sample a color into the foreground swatch.

---

### Shape Tools

Draw vector-style shapes onto a layer.

| Tool | Shortcut |
|------|----------|
| Rectangle | `R` |
| Ellipse | `O` |
| Line | `L` |
| Arrow | `A` |

Hold `Shift` while dragging to constrain proportions (squares, circles, 45° lines).

---

## Layers

The editor is layer-based. Stack multiple layers, reorder them, toggle visibility, and composite them with blend modes.

- **Blend modes** — choose how a layer combines with the layers beneath it (Normal, Multiply, Screen, Overlay, and more). In the Layers panel, `↑`/`↓` step through blend modes.
- **Opacity** — set per-layer transparency.
- **Layer via copy / cut** — `Ctrl/⌘ + J` copies the current selection to a new layer; `Ctrl/⌘ + Shift + J` cuts it to a new layer.
- **Clear layer** — `Delete` or `Backspace` clears the active layer (or selection).
- **Fill layer** — `Ctrl/⌘ + Backspace` fills with the background color; `Alt + Backspace` fills with the foreground color.

---

## Free Transform

**Shortcut:** `Ctrl/⌘ + T` (free transform) or `F` (transform tool)

Scale, rotate, and reposition the active layer or selection with a transform box.

- Press `Enter` to commit the transform, `Esc` to cancel.
- Press `.` to reset the transform box to identity without committing.
- `Ctrl/⌘ + Shift + T` repeats the last transform.

---

## Colors

The editor maintains a **foreground** and **background** color.

- `X` swaps the foreground and background colors.
- `D` resets them to the defaults (black / white).
- `Ctrl/⌘ + I` inverts the colors of the active layer.

---

## History & Undo

The editor maintains a complete history of your changes.

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Undo** | `Ctrl/⌘ + Z` | Step backward through history |
| **Redo** | `Ctrl/⌘ + Shift + Z` (or `Ctrl/⌘ + Y`) | Step forward through history |

**History tracking:**
- Every action creates a history entry
- Navigate through unlimited undo/redo steps
- Each step is labeled with the action type
- History persists while editor is open

**Memory note:** Large images with extensive history may use significant memory. Consider saving intermediate versions if working on complex edits.

---

## Zoom & Navigation

Control your view of the canvas without affecting the image.

### Zoom Controls

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Zoom In** | `+` / `=` or scroll up | Magnify the view |
| **Zoom Out** | `-` or scroll down | Reduce the view |
| **Reset Zoom** | `Ctrl/⌘ + 0` | Fit the image to the viewport |
| **Zoom 100%** | `Ctrl/⌘ + 1` | Show the image at actual pixel size |

### Pan Controls

| Action | How |
|--------|-----|
| **Pan** | Space + drag, or middle-click drag |
| **Toggle panels** | `Tab` |

**Tips:**
- Use high zoom for detailed work (brushing, retouching)
- Use reset zoom to see the overall composition
- Pan while zoomed to work on different areas

---

## Saving & Exporting

### Save to Workflow

Saves the composited image back to the node.
- Updates the node's property or output with the edited version
- Changes appear immediately in your workflow

**Use when:** You want to use the edited image in subsequent nodes.

### Export Image (PNG)

Use the **Export Image** action to write the composited result as a PNG (all visible layers flattened, transparency preserved).

**Note:** `Ctrl/⌘ + D` is **Deselect**, not download — see the shortcuts below.

### Close

Closes the editor.

---

## Keyboard Shortcuts

### Tools

| Key | Tool |
|-----|------|
| `V` | Move |
| `M` | Rectangular marquee select |
| `W` | Magic wand select |
| `C` | Crop |
| `B` | Brush |
| `P` | Pencil |
| `E` | Eraser |
| `G` | Fill |
| `T` | Gradient |
| `S` | Clone stamp |
| `Q` | Blur |
| `I` | Eyedropper |
| `F` | Transform |
| `R` | Rectangle |
| `O` | Ellipse |
| `L` | Line |
| `A` | Arrow |

### Edit & Selection

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` (or `Ctrl/⌘ + Y`) | Redo |
| `Ctrl/⌘ + C` / `X` / `V` | Copy / cut / paste |
| `Ctrl/⌘ + A` | Select all |
| `Ctrl/⌘ + D` | Deselect |
| `Ctrl/⌘ + Shift + D` | Reselect |
| `Ctrl/⌘ + Shift + I` | Invert selection |
| `Ctrl/⌘ + T` | Free transform |
| `Ctrl/⌘ + Shift + T` | Repeat last transform |
| `Ctrl/⌘ + J` | Layer via copy |
| `Ctrl/⌘ + Shift + J` | Layer via cut |
| `Ctrl/⌘ + I` | Invert colors |
| `Delete` / `Backspace` | Clear layer/selection |
| `Ctrl/⌘ + Backspace` | Fill with background color |
| `Alt + Backspace` | Fill with foreground color |
| `Esc` | Cancel / deselect |

### Colors & Brush

| Shortcut | Action |
|----------|--------|
| `X` | Swap foreground/background colors |
| `D` | Reset colors to default |
| `[` / `]` | Decrease / increase tool size |
| `1`–`0` | Set tool opacity preset (e.g. `0` = 100%) |

### Navigation

| Shortcut | Action |
|----------|--------|
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `Ctrl/⌘ + 0` | Reset zoom (fit) |
| `Ctrl/⌘ + 1` | Zoom to 100% |
| `Tab` | Toggle panels |
| `Space + drag` | Pan canvas |

---

## Common Workflows

### Retouching on a Separate Layer

**Goal:** Fix blemishes non-destructively.

1. Open image in editor
2. Add a new layer above the image
3. Select the **Clone Stamp** (`S`) and set a source point on clean pixels
4. Paint over the blemish to cover it
5. Adjust the layer opacity to blend if needed
6. Click **Save** to apply

---

### Adding Annotations

**Goal:** Highlight specific areas with arrows.

1. Open image in editor
2. Select **Arrow tool** (`A`)
3. Draw arrows pointing at features of interest
4. Use the **Rectangle** (`R`) or **Ellipse** (`O`) tool to box areas
5. Pick a high-contrast foreground color so markers stand out
6. Click **Save**

**Use cases:**
- Tutorial images
- Bug reports with visual markers
- Documentation screenshots

---

### Creating Thumbnails

**Goal:** Extract a specific portion of an image.

1. Open image in editor
2. Select **Crop tool** (`C`)
3. Drag the crop box to the desired region
4. Press `Enter` to commit
5. Click **Save** or use **Export Image**

**Use cases:**
- Profile pictures
- Featured image sections
- Focus on specific content areas

---

### Touch-Up Editing

**Goal:** Remove small imperfections or add details.

1. Open image in editor
2. Zoom in to the problem area (`+`)
3. Select **Brush tool** (`B`)
4. Adjust size to match area (small brush for precision)
5. Select color matching nearby pixels
6. Carefully paint over imperfections
7. Use **Eraser** (`E`) to refine if needed
8. Zoom out to check overall appearance
9. Click **Save**

**Tips:**
- Use low opacity (30-50%) for natural blending
- Make multiple light strokes instead of one heavy stroke
- Sample colors from the image for best matching

---

## Tips & Best Practices

### Performance

- **Large images:** Editor handles images up to 8000x8000 pixels efficiently
- **History:** Extensive edit history increases memory usage; reset if sluggish
- **Complex edits:** Consider breaking into multiple edit sessions
- **Browser limits:** Very large images may hit browser memory constraints

### Non-Destructive Editing

- Original image is never modified
- All edits are applied to a copy
- Close without saving to revert completely
- Save creates a new version in the workflow

### Quality Preservation

- Editor maintains original image quality
- Saves/exports as PNG to preserve transparency
- No compression artifacts unless image is re-encoded

### Workflow Integration

- Edit at any point in your workflow
- Chain multiple image editing nodes
- Use variables to batch-process similar edits
- Combine with AI image nodes for hybrid workflows

### Collaboration

- Edited images include all changes in saved version
- Share workflows with edited images included
- Download option enables external sharing
- Consider adding comment nodes to explain edits

---

## Troubleshooting

### Editor Won't Open

**Symptoms:** Clicking edit icon does nothing or shows error.

**Solutions:**
1. Check console for errors (F12 in browser)
2. Verify image has loaded completely
3. Try refreshing the page
4. Clear browser cache and reload

### Changes Not Saving

**Symptoms:** Edits disappear after closing editor.

**Solutions:**
1. Always click **Save** button before closing
2. Check for save confirmation message
3. Verify workflow is not in read-only mode
4. Ensure you have write permissions

### Slow Performance

**Symptoms:** Laggy brush strokes, slow zoom/pan.

**Solutions:**
1. Click **Reset** to clear history
2. Reduce image size before editing (crop first)
3. Close other browser tabs
4. Restart browser to free memory
5. Consider editing in smaller sections

### Image Looks Different After Saving

**Symptoms:** Colors or quality change after save.

**Solutions:**
1. Check whether a layer's blend mode or opacity changed the result
2. Toggle layer visibility to isolate which layer changed the look
3. Verify monitor color calibration
4. PNG format preserves quality - no compression loss

### Can't Undo Far Enough

**Symptoms:** Undo doesn't go back to original.

**Solutions:**
1. History has limits based on available memory
2. Use **Reset** button to return to original completely
3. Close and reopen editor for fresh start
4. Consider editing in stages with saves in between

---

## Related Features

- **[Color Picker](workflow-editor.md#color-picker)** - Advanced color selection for brush and shape tools
- **[Asset Management](asset-management.md)** - Organize and reuse edited images
- **[Workflow Editor](workflow-editor.md)** - Main editor documentation

---

## Next Steps

**Now that you know the Image Editor:**
1. Try editing an image in your current workflow
2. Experiment with different tools and adjustments
3. Create an annotation workflow for documentation
4. Explore combining with AI image generation nodes

**More resources:**
- [Tips and Tricks](tips-and-tricks.md) - Efficiency shortcuts
- [Getting Started](getting-started.md) - New user guide
- [Cookbook](cookbook.md) - Example workflows with image editing

---

*Last updated: January 2026*
