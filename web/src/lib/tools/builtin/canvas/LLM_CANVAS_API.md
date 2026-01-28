# LLM Canvas Design API

A comprehensive set of tools for LLM agents to create and manipulate design elements on a canvas. Compatible with Sketch file format for import/export.

## Overview

The Canvas Design API exposes design operations as discrete, composable tools that LLM agents can call to build visual layouts programmatically. Each tool returns descriptive feedback to help the LLM understand what happened.

## Quick Start

```typescript
// 1. Create an artboard (canvas)
await call("ui_canvas_create_artboard", {
  width: 375,
  height: 812,
  backgroundColor: "#ffffff"
});

// 2. Add a header rectangle
await call("ui_canvas_create_rectangle", {
  x: 0, y: 0, width: 375, height: 64,
  fill: "#4A90D9",
  name: "Header"
});

// 3. Add title text
await call("ui_canvas_create_text", {
  x: 20, y: 20, content: "My App",
  fontSize: 24, fontWeight: "bold", color: "#ffffff",
  name: "Title"
});
```

## Tool Reference

### Creation Tools

#### `ui_canvas_create_artboard`
Initialize or resize the canvas/artboard.

```typescript
{
  width: number,      // Canvas width in pixels
  height: number,     // Canvas height in pixels
  backgroundColor?: string  // Hex color (#FFFFFF)
}
```

**Common sizes:**
- Desktop: 1920×1080, 1440×900
- Tablet: 768×1024, 834×1194
- Mobile: 375×812 (iPhone), 390×844 (iPhone Pro)

#### `ui_canvas_create_rectangle`
Create a rectangle element for backgrounds, containers, buttons, etc.

```typescript
{
  x: number,
  y: number,
  width: number,
  height: number,
  name?: string,
  fill?: string,          // Fill color (#RRGGBB)
  stroke?: string,        // Border color
  strokeWidth?: number,   // Border width
  borderRadius?: number,  // Corner radius
  opacity?: number        // 0-1
}
```

#### `ui_canvas_create_ellipse`
Create an ellipse or circle (equal width/height for circle).

```typescript
{
  x: number,
  y: number,
  width: number,
  height: number,
  name?: string,
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  opacity?: number
}
```

#### `ui_canvas_create_text`
Create a text element with font customization.

```typescript
{
  x: number,
  y: number,
  content: string,
  width?: number,
  height?: number,
  name?: string,
  color?: string,
  fontFamily?: string,    // 'Inter', 'Roboto', 'Arial', etc.
  fontSize?: number,
  fontWeight?: 'normal' | 'bold' | '100'-'900',
  alignment?: 'left' | 'center' | 'right',
  verticalAlignment?: 'top' | 'middle' | 'bottom',
  lineHeight?: number,
  letterSpacing?: number
}
```

#### `ui_canvas_create_image`
Create an image element.

```typescript
{
  x: number,
  y: number,
  width: number,
  height: number,
  source?: string,        // URL or asset ID
  name?: string,
  fit?: 'cover' | 'contain' | 'fill',
  opacity?: number
}
```

#### `ui_canvas_create_line`
Create a line element with optional arrows.

```typescript
{
  x: number,
  y: number,
  width: number,
  height?: number,        // 0 for horizontal line
  name?: string,
  strokeColor?: string,
  strokeWidth?: number,
  startArrow?: boolean,
  endArrow?: boolean,
  opacity?: number
}
```

#### `ui_canvas_create_group`
Group existing elements together.

```typescript
{
  elementIds: string[],   // IDs of elements to group
  name?: string
}
```

---

### Manipulation Tools

#### `ui_canvas_update_element`
Update an element's basic properties.

```typescript
{
  elementId: string,
  x?: number,
  y?: number,
  width?: number,
  height?: number,
  rotation?: number,
  name?: string,
  visible?: boolean,
  locked?: boolean
}
```

#### `ui_canvas_move_element`
Move an element (absolute or relative).

```typescript
{
  elementId: string,
  x?: number,           // Absolute X position
  y?: number,           // Absolute Y position
  offsetX?: number,     // Relative X offset
  offsetY?: number      // Relative Y offset
}
```

#### `ui_canvas_resize_element`
Resize an element.

```typescript
{
  elementId: string,
  width?: number,
  height?: number,
  scaleX?: number,      // Scale factor (2.0 = double)
  scaleY?: number,
  maintainAspectRatio?: boolean
}
```

#### `ui_canvas_apply_style`
Apply styling to an element.

```typescript
{
  elementId: string,
  // Common styles
  fill?: string,
  stroke?: string,
  strokeWidth?: number,
  opacity?: number,
  borderRadius?: number,
  // Shadow
  shadowEnabled?: boolean,
  shadowColor?: string,
  shadowOffsetX?: number,
  shadowOffsetY?: number,
  shadowBlur?: number,
  // Text-specific
  color?: string,
  fontFamily?: string,
  fontSize?: number,
  fontWeight?: string,
  alignment?: string,
  verticalAlignment?: string
}
```

#### `ui_canvas_delete_elements`
Delete elements from the canvas.

```typescript
{
  elementIds: string[]
}
```

#### `ui_canvas_duplicate_elements`
Duplicate elements.

```typescript
{
  elementIds: string[],
  offsetX?: number,     // Default: 20
  offsetY?: number      // Default: 20
}
```

#### `ui_canvas_set_text`
Update text content.

```typescript
{
  elementId: string,
  content: string
}
```

#### `ui_canvas_set_image`
Update image source.

```typescript
{
  elementId: string,
  source: string,
  fit?: 'cover' | 'contain' | 'fill'
}
```

#### `ui_canvas_select`
Select elements.

```typescript
{
  elementIds: string[]  // Empty array clears selection
}
```

---

### Layout Tools

#### `ui_canvas_align_elements`
Align multiple elements.

```typescript
{
  elementIds: string[],
  direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom',
  alignToCanvas?: boolean
}
```

#### `ui_canvas_distribute_elements`
Distribute elements evenly (requires 3+ elements).

```typescript
{
  elementIds: string[],
  direction: 'horizontal' | 'vertical'
}
```

#### `ui_canvas_tidy_elements`
Arrange elements into a neat grid.

```typescript
{
  elementIds: string[],
  spacing?: number      // Default: 10
}
```

#### `ui_canvas_set_spacing`
Set exact spacing between elements.

```typescript
{
  elementIds: string[],
  direction: 'horizontal' | 'vertical',
  spacing: number
}
```

#### Layer Ordering Tools
- `ui_canvas_bring_to_front`: Bring to front (highest z-index)
- `ui_canvas_send_to_back`: Send to back (lowest z-index)
- `ui_canvas_bring_forward`: Move up one level
- `ui_canvas_send_backward`: Move down one level

All take: `{ elementIds: string[] }`

---

### Query Tools

#### `ui_canvas_get_state`
Get full canvas state.

```typescript
{
  includeProperties?: boolean  // Include full element properties
}
```

#### `ui_canvas_get_element`
Get element details by ID.

```typescript
{
  elementId: string
}
```

#### `ui_canvas_list_elements`
List/filter elements.

```typescript
{
  type?: 'text' | 'rectangle' | 'ellipse' | 'image' | 'line' | 'group',
  nameContains?: string,
  visibleOnly?: boolean
}
```

#### `ui_canvas_get_selection`
Get currently selected elements.

```typescript
{}
```

#### `ui_canvas_find_at_position`
Find elements at a position.

```typescript
{
  x: number,
  y: number,
  tolerance?: number
}
```

#### `ui_canvas_get_bounds`
Calculate bounding box of elements.

```typescript
{
  elementIds?: string[]  // Omit for all elements
}
```

#### `ui_canvas_get_dimensions`
Get canvas size and background.

```typescript
{}
```

---

### Export Tools

#### `ui_canvas_export_json`
Export as JSON data.

```typescript
{
  pretty?: boolean
}
```

#### `ui_canvas_export_sketch`
Export as Sketch file (triggers download).

```typescript
{
  filename?: string,    // Without extension
  pageName?: string
}
```

#### `ui_canvas_get_export_data`
Get export data without download.

```typescript
{
  format?: 'json' | 'minimal'
}
```

---

## Design Patterns

### Card Layout
```typescript
// Card container
await call("ui_canvas_create_rectangle", {
  x: 20, y: 20, width: 335, height: 200,
  fill: "#ffffff", borderRadius: 12,
  name: "Card"
});

// Card shadow
await call("ui_canvas_apply_style", {
  elementId: cardId,
  shadowEnabled: true,
  shadowColor: "#00000020",
  shadowOffsetY: 4,
  shadowBlur: 12
});

// Card content
await call("ui_canvas_create_text", { ... });
await call("ui_canvas_create_image", { ... });
```

### Button
```typescript
// Button background
const bg = await call("ui_canvas_create_rectangle", {
  x: 100, y: 400, width: 175, height: 48,
  fill: "#4A90D9", borderRadius: 24,
  name: "Button BG"
});

// Button text
await call("ui_canvas_create_text", {
  x: 100, y: 400, width: 175, height: 48,
  content: "Continue",
  color: "#ffffff", fontSize: 16, fontWeight: "600",
  alignment: "center", verticalAlignment: "middle",
  name: "Button Text"
});
```

### Navigation Bar
```typescript
// Nav container
await call("ui_canvas_create_rectangle", {
  x: 0, y: 0, width: 375, height: 64,
  fill: "#ffffff",
  name: "Nav Bar"
});

// Back button
await call("ui_canvas_create_text", {
  x: 16, y: 20, content: "← Back",
  fontSize: 17, color: "#007AFF"
});

// Title
await call("ui_canvas_create_text", {
  x: 0, y: 20, width: 375,
  content: "Settings",
  fontSize: 17, fontWeight: "600",
  alignment: "center"
});
```

### Form Layout
```typescript
// Create multiple inputs
const ids = [];
for (let i = 0; i < 3; i++) {
  const input = await call("ui_canvas_create_rectangle", {
    x: 20, y: 100 + i * 60, width: 335, height: 44,
    fill: "#f5f5f5", borderRadius: 8
  });
  ids.push(input.element.id);
}

// Distribute evenly
await call("ui_canvas_set_spacing", {
  elementIds: ids,
  direction: "vertical",
  spacing: 16
});
```

---

## Best Practices

### Naming Conventions
- Use descriptive names: "Header Background", "Login Button", "Profile Image"
- Group related elements: "Card", "Card Title", "Card Description"

### Spacing & Alignment
- Use consistent spacing: 8px, 16px, 24px, 32px grid
- Always align related elements
- Use `distribute_elements` for even spacing

### Colors
- Define a palette and reuse colors
- Use opacity for overlays: "#00000050"
- Shadow colors typically: "#00000020" to "#00000040"

### Typography Hierarchy
- Title: 24-32px, bold
- Heading: 18-20px, semibold
- Body: 14-16px, regular
- Caption: 12px, regular

### Layer Organization
- Use `send_to_back` for backgrounds
- Use `bring_to_front` for overlays
- Group related elements

---

## What Works ✅

- **Full element creation**: All basic shapes, text, images, lines
- **Comprehensive styling**: Fill, stroke, opacity, shadows, border radius
- **Text formatting**: Font family, size, weight, alignment, decoration
- **Layout operations**: Align, distribute, tidy, spacing
- **Layer management**: Z-ordering, visibility, lock
- **State queries**: Get state, find elements, calculate bounds
- **Export**: JSON and Sketch file formats
- **History**: Undo/redo built into store

## What's Missing / Future Work 🚧

### Not Yet Implemented
- **Gradients**: Linear/radial gradient fills (types exist, not in tools)
- **Boolean operations**: Union, subtract, intersect shapes
- **Text on path**: Text following a curved path
- **Auto-layout**: Flexbox-like layout system
- **Components/symbols**: Reusable design components
- **Constraints**: Responsive design constraints
- **Export to PNG/SVG**: Rasterization (requires canvas rendering)
- **Import from Sketch**: Reading .sketch files (parser exists, not in tools)
- **Batch operations**: Update multiple elements in one call
- **Animation**: Motion design capabilities

### Limitations
- Canvas is single-page (no multi-page support via tools)
- No nested group manipulation
- Image sources must be URLs or existing asset IDs
- No real-time collaboration features

---

## Error Handling

All tools return a response object:

```typescript
// Success
{ ok: true, message: "...", element: { ... } }

// Failure
{ ok: false, error: "Error description" }
```

Always check `ok` before proceeding.

---

## Integration

### Importing the Tools
```typescript
// Import to register all canvas tools
import "@/lib/tools/builtin/canvas";

// Tools are now in FrontendToolRegistry
```

### Calling from Agent
```typescript
const result = await FrontendToolRegistry.call(
  "ui_canvas_create_rectangle",
  { x: 0, y: 0, width: 100, height: 100 },
  toolCallId,
  { getState: () => state }
);
```

### Getting Tool Manifest
```typescript
// Get all registered tools for LLM manifest
const manifest = FrontendToolRegistry.getManifest();
```
