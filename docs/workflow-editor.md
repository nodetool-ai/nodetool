---
layout: page
title: "Workflow Editor"
description: "Build AI workflows visually."
---

Build workflows by connecting nodes.

> **New?** Start with [Getting Started](getting-started.md).

---

## Editor Layout

| Area | Where | What It Does |
|------|-------|--------------|
| **Canvas** | Center | Place and connect nodes |
| **Side Panels** | Left/Right | Workflows, assets, settings |
| **Toolbar** | Bottom | Run, save, layout controls |

---

## Canvas Basics

Your infinite workspace.

**Navigate:**

| Do This | How |
|---------|-----|
| Pan | `Space` + drag, or right-click drag |
| Zoom | `Ctrl/⌘` + scroll |
| Fit everything | `F` |
| Reset zoom | `Ctrl/⌘ + 0` |

**The grid** helps align nodes. Turn on **Snap to Grid** in View menu.

---

## Working with Nodes

Each node does one thing.

### Add Nodes

**Space bar:**
1. Press `Space` anywhere
2. Type what you want ("image", "text")
3. Click to add

**Double-click:**
1. Double-click empty space
2. Opens node menu

**Smart connect:**
1. Drag from a node's output
2. Drop on empty space
3. See compatible nodes

### Node Structure

- **Header** (top) - Name, drag to move
- **Inputs** (left circles) - Data in
- **Outputs** (right circles) - Data out
- **Properties** - Settings panel

### Select Nodes

| Do This | How |
|---------|-----|
| One | Click it |
| Multiple | `Shift` + click, or drag box |
| All | `Ctrl/⌘ + A` |
| None | Click canvas |

### Move Nodes

- **Drag** header to move
- **Arrow keys** to nudge
- **Auto Layout** button to organize

### Bypass Nodes

Skip temporarily without deleting:

1. Right-click node
2. Select **Bypass Node**
3. Node dims, data passes through

Good for:
- **Testing** - Compare with/without
- **Debugging** - Isolate problems
- **A/B testing** - Toggle effects

Re-enable: Right-click → **Enable Node**

### Result Overlays

Nodes show outputs on canvas:

- **Images** - Thumbnail preview
- **Text** - Text snippet
- **Audio** - Waveform
- **Progress** - Live status

---

## Connections

Show data flow.

### Make Connections

1. Click output circle (right side)
2. Drag the line to an **input** circle (left side of another node)
3. Release to connect

### Connection Rules

- **Types must match**: You can only connect compatible types (text to text, image to image)
- **One input, multiple outputs**: Each input accepts one connection; outputs can connect to many
- **Color coding**: Connection colors indicate data type

### Removing Connections

- Click a connection line, then press `Delete`
- Right-click a connection for options
- Drag the connection away from its target and release

### Smart Connections

When you drag a connection and release on **empty space**, the **Connection Menu** appears:

- **Auto-create** common nodes for that data type
- **Browse compatible nodes** filtered by what can receive the data
- **Cancel** by pressing `Esc`

---

## Running Workflows

### Starting a Run

| Method | How |
|--------|-----|
| Button | Click **Run** in the bottom toolbar |
| Keyboard | `Ctrl/⌘ + Enter` |

### Watching Progress

- **Streaming nodes** show output as it's generated
- **Preview nodes** display intermediate results
- **Node borders** indicate status (running, complete, error)
- **Edge animations** show data flowing between nodes

### Pausing and Resuming

You can temporarily pause a running workflow:

| Action | Button | Description |
|--------|--------|-------------|
| **Pause** | ⏸ (blue) | Temporarily stops execution - workflow state is preserved |
| **Resume** | ▶ (blue) | Continues from where it paused |

The pause button appears in the floating toolbar while a workflow is running.

### Suspended Workflows

Some nodes (like the **WaitNode**) can suspend a workflow to wait for external input:

| State | Button | Description |
|-------|--------|-------------|
| **Suspended** | ▶ (purple) | Workflow is waiting for input - click to resume |

When a workflow is suspended:
- A notification shows why the workflow is waiting
- The purple Resume button appears in the toolbar
- Click Resume to continue the workflow with any required data
- The workflow can be stopped (cancelled) if no longer needed

Suspended workflows are useful for:
- **Human-in-the-loop** approvals
- **Waiting for external data** or API responses
- **Checkpoint-based processing** where you review intermediate results

### Stopping a Run

| Method | How |
|--------|-----|
| Button | Click **Stop** (enabled when running, paused, or suspended) |
| Keyboard | `Esc` |

### Missing Models

If a node needs an AI model you haven't installed:
1. Click the **"Missing Model"** indicator on the node
2. The **Recommended Models** dialog opens
3. Click to install – runs in background while you work

---

## Organizing Your Workflow

### Auto Layout

Click the **Auto Layout** button (or press `L`) to automatically arrange your nodes in a clean, readable layout. The editor also auto-arranges nodes when Global Chat creates or modifies workflows.

### Grouping Nodes

Select multiple nodes and press `Ctrl/⌘ + G` to group them. Groups:
- Keep related nodes together
- Can be collapsed to save space
- Move as a unit

### Aligning Nodes

| Shortcut | Action |
|----------|--------|
| `A` | Align selected nodes |
| `Shift + A` | Align and distribute evenly |

---

## Panels and Tabs

### Multiple Workflows

- Open multiple workflows in **tabs** at the top
- Switch with `Ctrl/⌘ + 1-9` or click the tab
- Drag tabs to reorder

### Left Panel

Access these views by clicking icons on the left:

| Icon | Panel | Purpose |
|------|-------|---------|
| 📂 | Workflows | Your saved workflows |
| 💬 | Chat | Global Chat |
| 📁 | Assets | Your files |
| 📚 | Collections | RAG document collections |
| 📦 | Packs | Installed node packs |

### Right Panel (Inspector)

Press `i` to toggle the **Inspector** panel, which shows:
- Detailed properties for selected nodes
- Input/output documentation
- Validation errors and warnings

---

## Finding Nodes

### The Node Menu

Press `Space` to open, then:

- **Search**: Just start typing ("whisper", "image", "agent")
- **Browse**: Explore the category tree on the left
- **Filter**: Click the filter icon to show only nodes with specific input/output types
- **Move**: Drag the menu to reposition it
- **Close**: `Esc` or click outside

### Node Documentation

Get help on any node:

1. **In the Node Menu**: Hover over a node to see its description
2. **On the canvas**: Hover over the `?` icon at the bottom-right of any node
3. **Inspector**: Select a node and view full documentation in the right panel

---

## Context Menus

Right-click for options anywhere:

| Location | Options |
|----------|---------|
| **Canvas** | Add node, paste, select all |
| **Node header** | Copy, duplicate, delete, group, bypass |
| **Input/Output** | Disconnect, add compatible node |
| **Connection** | Delete, add node in middle |

---

## Built-in Editors

NodeTool includes professional editing tools for creative work.

### Image Editor

Click the edit icon on image outputs or properties to open the full-featured editor:

- **Crop & Resize**: Adjust image dimensions and composition
- **Rotate & Flip**: Transform orientation
- **Draw Tools**: Brush, shapes, and text overlays
- **Adjustments**: Brightness, contrast, saturation controls
- **History**: Undo/redo all changes

### Color Picker

The professional color picker appears when selecting colors in properties:

- **Visual Selection**: Saturation/brightness picker with hue slider
- **Multiple Formats**: Enter values as HEX, RGB, or HSL
- **Harmony Modes**: Complementary, triadic, analogous color suggestions
- **Gradient Builder**: Create and edit color gradients
- **Swatches**: Save and reuse favorite colors
- **Contrast Checker**: Verify accessibility compliance
- **Eyedropper**: Pick colors from anywhere on screen

---

## Keyboard Shortcuts

### Essential Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Open node menu |
| `Ctrl/⌘ + Enter` | Run workflow |
| `Ctrl/⌘ + S` | Save |
| `Ctrl/⌘ + Z` | Undo |
| `F` | Fit view |
| `Esc` | Stop / Cancel |

### All Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/⌘ + C` | Copy |
| `Ctrl/⌘ + V` | Paste |
| `Ctrl/⌘ + X` | Cut |
| `Ctrl/⌘ + D` | Duplicate horizontally |
| `Ctrl/⌘ + Shift + D` | Duplicate vertically |
| `Ctrl/⌘ + G` | Group selection |
| `Ctrl/⌘ + 0` | Reset zoom to 100% |
| `Ctrl/⌘ + 1-9` | Switch to tab 1-9 |
| `A` | Align selected nodes |
| `Shift + A` | Align and distribute |
| `Arrow keys` | Nudge selected nodes |
| `Delete` / `Backspace` | Delete selection |
| `i` | Toggle Inspector |
| `1-5` | Open left panel menus |

---

## Tips

### Design Principles

1. **Left to right**: Data flows left to right
2. **Preview often**: Add Preview nodes for intermediate results
3. **Name clearly**: Rename nodes to describe their purpose
4. **Group logically**: Keep related nodes together

### Debugging

- **Add Preview nodes** between steps
- **Check connections** – verify data types match
- **Look at errors** – nodes show error messages
- **Test incrementally** – run partial workflows first

### Performance

- **Local models** – slower but work offline
- **Cloud models** – faster, require internet
- **Streaming nodes** – show progress during execution

---

## Next Steps

- **[Cookbook](cookbook.md)** – Workflow patterns and best practices
- **[Workflow Examples](workflows/)** – Ready-to-use workflows
- **[Tips & Tricks](tips-and-tricks.md)** – Power user features
- **[Node Reference](nodes/)** – All available nodes
