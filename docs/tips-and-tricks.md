---
layout: page
title: "Tips and Tricks"
description: "Shortcuts and efficiency tips for NodeTool."
---

Shortcuts, hidden features, and workflow efficiency tips.

---

## Essential Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Open node menu |
| `Ctrl/⌘ + Enter` | Run workflow |
| `Ctrl/⌘ + S` | Save |
| `F` | Fit view |
| `Ctrl/⌘ + Z` | Undo |
| `Alt/⌘ + K` | Command menu |

---

## Quick Node Actions

### Adding Nodes Faster

- **Search by typing**: Press `Space`, then just type what you need ("agent", "image", "whisper")
- **Smart connect**: Drag a connection to empty space → get compatible node suggestions
- **Duplicate quickly**: `Ctrl/⌘ + D` copies selected nodes horizontally

### Model Selection

- **Recommended Models**: Click the "Recommended Models" button on AI nodes to see compatible options
- **Quick switch**: Use the Model dropdown to change models without rewiring

### Node Organization

- **Drag from header**: Move nodes by grabbing the header bar (top of node)
- **Group related nodes**: Select multiple, press `Ctrl/⌘ + G`
- **Align selection**: Press `A` to align, `Shift + A` to align and distribute evenly

---

## Canvas Navigation

| Action | How |
|--------|-----|
| **Pan around** | `Space` + drag, or right-click drag |
| **Zoom** | `Ctrl/⌘` + scroll wheel |
| **Fit to screen** | Press `F` |
| **Focus on selection** | Select nodes, then press `F` |
| **Reset zoom** | `Ctrl/⌘ + 0` |
| **Snap to grid** | Enable in View menu |

---

## Connections

### Making Connections

- **Type matching**: Colors show compatible connections
- **Quick connect**: Drop on empty space for auto-suggestions
- **Multi-output**: One output can connect to multiple inputs

### Connection Tips

- **Preview intermediate data**: Add Preview nodes between connections
- **Disconnect**: Right-click connection or drag it away
- **Re-route**: Delete and recreate, or drag to a new target

---

## Workflow Management

### Organization

- **Save often**: `Ctrl/⌘ + S` – your work auto-saves, but manual saves create versions
- **Use descriptive names**: Rename workflows and nodes for clarity
- **Templates**: Save common patterns as templates

### History & Undo

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl/⌘ + Z` |
| Redo | `Ctrl/⌘ + Shift + Z` |
| Full history | Available in Edit menu |

### Layout Recovery

- **Lost panels?** View → Reset Layout restores default
- **Auto layout**: Click the Auto Layout button to tidy up

---

## Debugging Workflows

### Finding Problems

1. **Add Preview nodes** between steps to see data at each stage
2. **Check node errors** – red borders or icons indicate issues
3. **Verify connections** – ensure types match
4. **Test incrementally** – run partial workflows first
5. **Bypass nodes** – right-click → Bypass to skip suspicious nodes

### Using Bypass for Debugging

Bypass is a useful debugging technique:

- **Isolate issues**: Bypass nodes one at a time to find the problem
- **Compare outputs**: Toggle bypass to see before/after results
- **Skip slow steps**: Temporarily bypass heavy processing during testing

### Common Fixes

| Problem | Solution |
|---------|----------|
| "Missing Model" | Click the indicator to install |
| Wrong output | Check input data and node settings |
| Workflow won't run | Look for disconnected required inputs |
| Slow execution | Try cloud providers for heavy tasks |
| Node causing errors | Bypass it to test downstream nodes |

---

## Power User Features

### Command Menu

Press `Alt/⌘ + K` to open the command menu – the fastest way to:
- Open any workflow by name
- Switch views and panels
- Access settings
- Search for anything

### Multi-Tab Workflow

- **Multiple workflows**: Open in tabs, switch with `Ctrl/⌘ + 1-9`
- **Reference between**: Copy nodes from one workflow to another
- **Side by side**: Drag tabs to split view

### Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| `1-5` | Switch left panel |
| `i` | Toggle Inspector (right panel) |
| `Ctrl/⌘ + F` | Search nodes on canvas by label |
| `Arrow keys` | Nudge selected nodes |
| `Shift + ?` | Open node documentation |

---

## AI Model Tips

### Choosing Models

- **Local for privacy**: Use local models for sensitive data
- **Cloud for speed**: API models are faster
- **Mix both**: Local preprocessing → cloud generation → local post-processing

### Performance

- **Smaller models first**: Test with fast models, upgrade for quality
- **Quantized models**: Smaller files, similar quality (Q4, Q8)
- **Streaming nodes**: See progress during execution

---

## Asset Management

### Working with Files

- **Drag and drop**: Drop files directly onto the canvas
- **Asset panel**: Press `3` to open (or click the Assets icon)
- **Preview**: Click any asset to preview it

### Organizing

- **Create folders**: Keep projects organized
- **Name clearly**: Descriptive names save time later
- **Clean up**: Delete unused assets to save space

---

## Collaboration Tips

### Sharing Workflows

1. **Export workflow**: Use the workflow export feature
2. **Mini-Apps**: Share as simplified interfaces
3. **Screenshots**: Document your workflows visually

### Working with Teams

- **Consistent naming**: Agree on conventions
- **Document**: Add comment nodes to explain complex sections
- **Template library**: Build shared templates

---

## Troubleshooting

### Quick Fixes

| Issue | Try This |
|-------|----------|
| Layout broken | View → Reset Layout |
| Node menu won't open | Refresh page, check for modals |
| Connection won't attach | Check type compatibility |
| Workflow stuck | Press `Esc` to stop, check error messages |

### Getting Help

- **Node docs**: Hover `?` on any node, or press `Shift + ?`
- **Discord**: Ask the community
- **GitHub Issues**: Report bugs

---

## Cheat Sheet

### Most Used Shortcuts

| Windows/Linux | Mac | Action |
|--------------|-----|--------|
| `Space` | `Space` | Node menu |
| `Ctrl + Enter` | `⌘ + Enter` | Run workflow |
| `Ctrl + S` | `⌘ + S` | Save |
| `Ctrl + Z` | `⌘ + Z` | Undo |
| `Ctrl + D` | `⌘ + D` | Duplicate |
| `F` | `F` | Fit to screen |
| `A` | `A` | Align nodes |
| `Alt + K` | `⌘ + K` | Command menu |
| `i` | `i` | Toggle Inspector |

---

## Next Steps

- **[Workflow Editor](workflow-editor.md)** – Full editor documentation
- **[Image Editor](image-editor.md)** – Professional image editing guide
- **[Cookbook](cookbook.md)** – Workflow patterns
- **[Keyboard Shortcuts](user-interface.md#keyboard-shortcuts)** – Complete list
