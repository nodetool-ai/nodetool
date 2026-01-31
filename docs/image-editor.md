---
layout: page
title: "Image Editor"
description: "Professional image editing built into NodeTool workflows."
---

Edit images directly in NodeTool with a full-featured editor.

> **Quick Access:** Click the edit icon (✏️) on any image output or property to open the editor.

---

## Overview

The Image Editor provides professional image editing tools without leaving your workflow. Edit images inline and see results immediately.

**Features:**
- Non-destructive editing with unlimited undo/redo
- Multiple drawing and shape tools
- Crop, rotate, and flip operations
- Brightness, contrast, and saturation adjustments
- Brush painting with customizable size, color, and opacity
- Export edited images back to your workflow or download

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

The Image Editor includes multiple tools organized in the left toolbar.

### Selection Tool (Select)

**Icon:** Hand/Cursor  
**Shortcut:** `V`

- Default tool for navigating the canvas
- Pan around the image
- No editing actions - just viewing

**Use when:** You want to navigate without accidentally drawing.

---

### Crop Tool

**Icon:** Crop rectangle  
**Shortcut:** `C`

Resize and reframe your image.

**How to crop:**
1. Click the **Crop** button
2. Drag the corners and edges of the crop box
3. Reposition the box by dragging inside it
4. Click **✓ Apply** to commit, or **✗ Cancel** to abort

**Tips:**
- Maintain aspect ratio by shift-dragging corners
- Fine-tune with keyboard arrows after placing the box
- Crop is applied to the current canvas state (includes all previous edits)

---

### Draw Tool (Brush)

**Icon:** Brush  
**Shortcut:** `B`

Paint freehand on the image.

**Settings:**
- **Brush Size:** Slider adjusts diameter (1-100 pixels)
- **Color:** Click color swatch to open color picker
- **Opacity:** Slider adjusts transparency (0-100%)

**How to use:**
1. Select Draw tool
2. Adjust size, color, opacity as needed
3. Click and drag on canvas to paint
4. Release to finish the stroke

**Use cases:**
- Add annotations or highlights
- Touch up small areas
- Draw attention to specific regions
- Create simple illustrations

---

### Erase Tool

**Icon:** Eraser  
**Shortcut:** `E`

Remove painted content (returns to original image underneath).

**Settings:**
- **Eraser Size:** Same as brush size slider

**How to use:**
1. Select Erase tool
2. Adjust size
3. Drag over areas to erase painted strokes

**Important:** Only erases drawn content, not original image pixels. To remove original image content, use crop or fill tools.

---

### Fill Tool (Bucket)

**Icon:** Paint bucket  
**Shortcut:** `G`

Fill areas with solid color.

**Settings:**
- **Fill Color:** Click color swatch to choose

**How to use:**
1. Select Fill tool
2. Choose fill color
3. Click an area to fill

**Behavior:** Fills contiguous regions of similar color. Tolerance determines how similar pixels must be to be filled.

---

### Text Tool

**Icon:** T letter  
**Shortcut:** `T`

Add text overlays to images.

**How to use:**
1. Select Text tool
2. Click where you want text to appear
3. Type your text
4. Adjust font, size, color in the properties panel
5. Click outside text box to finish

**Text properties:**
- Font family
- Font size
- Text color
- Bold, italic, underline
- Alignment

---

### Shape Tools

Draw geometric shapes on your image.

#### Rectangle Tool

**Icon:** Rectangle  
**Shortcut:** `R`

Draw rectangles and squares.

**How to use:**
1. Select Rectangle tool
2. Click and drag to create
3. Hold `Shift` for perfect squares

**Properties:**
- Fill color and opacity
- Stroke color and width

#### Ellipse Tool

**Icon:** Circle/Ellipse  
**Shortcut:** `O`

Draw circles and ellipses.

**How to use:**
1. Select Ellipse tool
2. Click and drag to create
3. Hold `Shift` for perfect circles

**Properties:**
- Fill color and opacity
- Stroke color and width

#### Line Tool

**Icon:** Diagonal line  
**Shortcut:** `L`

Draw straight lines.

**How to use:**
1. Select Line tool
2. Click starting point
3. Click ending point (or drag)

**Properties:**
- Stroke color
- Line width
- Line cap style (round, square, butt)

#### Arrow Tool

**Icon:** Arrow  
**Shortcut:** `A`

Draw arrows to point at features.

**How to use:**
1. Select Arrow tool
2. Click starting point (tail)
3. Click ending point (head) or drag

**Properties:**
- Stroke color
- Line width
- Arrowhead style

**Use cases:**
- Point out specific features
- Create diagrams or annotations
- Show directions or flow

---

## Quick Actions

Actions in the top toolbar apply immediately.

### Rotate

**Rotate Clockwise (90°)**  
**Icon:** ↻  
**Shortcut:** `Ctrl/⌘ + ]`

Rotates the entire canvas 90 degrees clockwise.

**Rotate Counter-Clockwise (90°)**  
**Icon:** ↺  
**Shortcut:** `Ctrl/⌘ + [`

Rotates the entire canvas 90 degrees counter-clockwise.

**When to use:**
- Fix image orientation
- Portrait to landscape conversion
- Correct camera rotation

---

### Flip

**Flip Horizontal**  
**Icon:** ⇆  
**Shortcut:** `Ctrl/⌘ + H`

Mirrors image left-to-right.

**Flip Vertical**  
**Icon:** ⇅  
**Shortcut:** `Ctrl/⌘ + V`

Mirrors image top-to-bottom.

**Use cases:**
- Create mirror effects
- Fix reversed text or images
- Symmetry adjustments

---

### Adjustments

Fine-tune image appearance with real-time adjustments.

**How to access:**
1. Click the **Adjustments** button (magic wand icon)
2. Panel opens with three sliders

#### Brightness

**Range:** -100 to +100  
**Default:** 0

Makes the image lighter or darker.
- **Negative values:** Darken the image
- **Positive values:** Lighten the image

#### Contrast

**Range:** -100 to +100  
**Default:** 0

Adjusts the difference between light and dark areas.
- **Negative values:** Reduce contrast (flatten)
- **Positive values:** Increase contrast (more dramatic)

#### Saturation

**Range:** -100 to +100  
**Default:** 0

Controls color intensity.
- **-100:** Grayscale (no color)
- **0:** Original colors
- **+100:** Hyper-saturated (vivid colors)

**Tips:**
- Adjustments are applied in real-time as you move sliders
- Combine adjustments for complex effects
- Use subtle adjustments for professional results
- Reset all adjustments with the Reset button

---

## History & Undo

The editor maintains a complete history of your changes.

| Action | Shortcut | Description |
|--------|----------|-------------|
| **Undo** | `Ctrl/⌘ + Z` | Step backward through history |
| **Redo** | `Ctrl/⌘ + Shift + Z` | Step forward through history |
| **Reset** | Reset button | Clear all edits, return to original |

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
| **Zoom In** | `Ctrl/⌘ + +` or scroll up | Magnify the view |
| **Zoom Out** | `Ctrl/⌘ + -` or scroll down | Reduce the view |
| **Fit to Screen** | `Ctrl/⌘ + 0` | Show entire image |
| **Zoom to Selection** | `Ctrl/⌘ + 1` | Fill screen with selection |

**Zoom levels:** 10% to 400%

### Pan Controls

| Action | How |
|--------|-----|
| **Pan** | Space + drag, or middle-click drag |
| **Pan with Select tool** | Click and drag background |

**Tips:**
- Use high zoom for detailed work (brushing, text editing)
- Use fit-to-screen to see overall composition
- Pan while zoomed to work on different areas

---

## Saving & Exporting

### Save to Workflow

**Button:** Save (disk icon)  
**Shortcut:** `Ctrl/⌘ + S`

Saves the edited image back to the node.
- Updates the node's property or output with edited version
- Changes appear immediately in your workflow
- Original image is preserved (non-destructive)

**Use when:** You want to use the edited image in subsequent nodes.

### Download Image

**Button:** Download (arrow down icon)  
**Shortcut:** `Ctrl/⌘ + D`

Downloads the edited image to your computer.
- Opens browser download dialog
- Saves as PNG format (preserves transparency)
- Default filename includes timestamp

**Use when:** You want a copy for external use.

### Close Without Saving

**Button:** Close (X icon)  
**Shortcut:** `Esc`

Closes the editor without applying changes.
- Discards all edits made in this session
- Returns to workflow with original image unchanged

**Confirmation:** If you have unsaved changes, you'll see a confirmation dialog.

---

## Keyboard Shortcuts

### Tools

| Key | Tool |
|-----|------|
| `V` | Select |
| `C` | Crop |
| `B` | Brush (Draw) |
| `E` | Eraser |
| `G` | Fill |
| `T` | Text |
| `R` | Rectangle |
| `O` | Ellipse (circle) |
| `L` | Line |
| `A` | Arrow |

### Actions

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + Shift + Z` | Redo |
| `Ctrl/⌘ + ]` | Rotate clockwise |
| `Ctrl/⌘ + [` | Rotate counter-clockwise |
| `Ctrl/⌘ + H` | Flip horizontal |
| `Ctrl/⌘ + V` | Flip vertical |
| `Ctrl/⌘ + S` | Save |
| `Ctrl/⌘ + D` | Download |
| `Esc` | Close editor |

### Navigation

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + +` | Zoom in |
| `Ctrl/⌘ + -` | Zoom out |
| `Ctrl/⌘ + 0` | Fit to screen |
| `Space + drag` | Pan canvas |

---

## Common Workflows

### Basic Image Correction

**Goal:** Fix brightness and orientation.

1. Open image in editor
2. Click **Adjustments** (magic wand icon)
3. Adjust **Brightness** slider to correct exposure
4. Adjust **Contrast** for better definition
5. If rotated wrong, use **Rotate** buttons
6. Click **Save** to apply

**Time:** Under 30 seconds

---

### Adding Annotations

**Goal:** Highlight specific areas with arrows and text.

1. Open image in editor
2. Select **Arrow tool** (`A`)
3. Draw arrows pointing at features of interest
4. Select **Text tool** (`T`)
5. Click near arrows to add explanatory text
6. Adjust colors to ensure visibility
7. Click **Save**

**Use cases:**
- Tutorial images
- Bug reports with visual markers
- Documentation screenshots

---

### Creating Thumbnails

**Goal:** Extract a specific portion of an image.

1. Open image in editor
2. Select **Crop tool** (`C`)
3. Drag crop box to desired region
4. Resize to preferred aspect ratio
5. Click **✓ Apply**
6. Optionally adjust brightness/contrast
7. Click **Save** or **Download**

**Use cases:**
- Profile pictures
- Featured image sections
- Focus on specific content areas

---

### Touch-Up Editing

**Goal:** Remove small imperfections or add details.

1. Open image in editor
2. Zoom in to problem area (`Ctrl/⌘ + +`)
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
- Adjustments use high-quality algorithms
- Saves as PNG to preserve transparency
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
1. Check if adjustments were accidentally applied
2. Reset adjustments sliders to 0 if needed
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
