---
layout: page
title: "Text and SVG Documents"
permalink: /text-and-svg-documents
description: "Create text files and SVG drawings from the New menu, then edit them in the code editor, the table editor, and the live SVG preview."
---

**New text file…** and **New SVG** in the tab bar's **+ New** menu create a project asset and open it in a tab. Edits save back to the same asset.

> **Runs:** locally in the browser. **Needs:** no API key. The SVG assistant needs an LLM provider (see [Providers](providers.md)).
{: .callout-note}

## The New menu

The menu has **Guided flows** and **Blank documents** sections. Blank documents are created in the open project, each in a new tab. If creation fails, a notification names what failed and why.

| Menu item | Creates | More |
|---|---|---|
| **New workflow** | An empty workflow in edit mode | [Workflow Editor](workflow-editor.md) |
| **New Comfy workflow** | A workflow in Comfy run mode with a starter graph | [ComfyUI](comfyui.md) |
| **New chat** | A chat thread | [Chat](global-chat.md) |
| **New text file…** | A text file from a template (submenu) | [Text files](#text-files) |
| **New sketch** | A blank 1024 by 1024 white image | [Sketch Editor](sketch-editor.md) |
| **New SVG** | A blank SVG drawing | [SVG documents](#svg-documents) |
| **New timeline** | "Untitled timeline" | [Video Editor](video-editor.md) |
| **New storyboard…** | A blank storyboard, or an example with stills (submenu) | |
| **New app** | "Untitled app" | [App Builder](app-builder.md) |
| **New script** | "Untitled script" | |
| **New JS script** | "Untitled JS script" | [JavaScript Sandbox](javascript-sandbox.md) |
| **New skill** | A skill with a generated name and starter body | [Skills](skills.md) |
| **New 3D model** | A model with one box | [3D Editor](3d-editor.md) |

Items with an ellipsis open a second list, and **Back** returns. Games are not in this menu. See [Game Editor](game-editor.md).

---

## Text files

**New text file…** lists six templates. Choosing one creates the asset and opens it in **Edit** mode.

| Template | File name | Starts with |
|---|---|---|
| Markdown (.md) | `Untitled.md` | Empty |
| JSON (.json) | `Untitled.json` | `{}` |
| YAML (.yaml) | `Untitled.yaml` | `---` |
| CSV (.csv) | `Untitled.csv` | A single column named `Column 1` |
| TSV (.tsv) | `Untitled.tsv` | A single column named `Column 1` |
| Plain text (.txt) | `Untitled.txt` | Empty |

The extension decides how the document is shown and highlighted.

### View and Edit

| Mode | Markdown | CSV and TSV | Everything else |
|---|---|---|---|
| **View** | Rendered Markdown | A read-only table. The first 2000 rows are shown | Read-only code with syntax highlighting |
| **Edit** | Code editor | An editable table | Code editor |

The view header shows the file name, the detected language, and a copy button that copies the whole text.

### The code editor

Edit mode uses Monaco with a minimap and word wrap on by default. The language comes from the file extension. A file with no known extension but a `text/` content type is plain text. The toolbar has **Undo**, **Redo**, **Toggle Word Wrap**, and **Save** (a dot marks unsaved changes). Ctrl+S (Cmd+S on macOS) saves. The Find & Replace and Format as Code Block buttons appear in the toolbar but are not wired up in this editor.

### The table editor

CSV and TSV files open as an editable table. On save the file is re-serialized with a comma for `.csv` or a tab for `.tsv`.

---

## SVG documents

**New SVG** creates `Untitled.svg` containing an empty 512 by 512 drawing:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
</svg>
```

### View and Edit

| Mode | What you see |
|---|---|
| **View** | The drawing, centered on a checkerboard so transparent areas read as transparent |
| **Edit** | The SVG markup in a code editor on the left and a live preview on the right |

The preview renders as you type, before you save. Markup with no `<svg>` element shows "No `<svg>` element to render". There is no drawing canvas. You write markup and watch the preview.

### Saving

**Save** (or Ctrl+S, Cmd+S on macOS) is disabled until you change something. A notification confirms the save or shows the error. The asset keeps its original content type, `image/svg+xml` by default.

### What the preview removes

The preview drops `<script>`, `<foreignObject>`, and the `onload`, `onerror`, and `onclick` attributes, and keeps shapes, paths, text, gradients, filters, masks, and symbols. The saved file is not changed, so the preview can differ from the raw file if it relies on scripts or embedded HTML.

### Ask the assistant

In edit mode an SVG assistant docks beside the editor (desktop only). It edits the same draft through `ui_svg_get_state`, `ui_svg_set_markup`, `ui_svg_replace`, and `ui_svg_save`. Edits show in the preview and undo like your own. The file is not saved until `ui_svg_save` runs, which you can ask for.

From the `recolor-and-save` case in `packages/agents/src/evals/surfaces/svg.ts`, whose fixture is an SVG with a blue circle (`fill="#1e64ff"`). The golden transcript is in `packages/agents/tests/svg-tool-loop.test.ts`.

```text
User: The SVG has a blue circle. Make the circle red, then save the SVG.
```

```json
[
  { "tool": "ui_svg_get_state", "arguments": {} },
  { "tool": "ui_svg_replace", "arguments": { "find": "fill=\"#1e64ff\"", "replace": "fill=\"#ff0000\"" } },
  { "tool": "ui_svg_save", "arguments": {} }
]
```

The draft markup changes from `#1e64ff` to `#ff0000` and the draft is marked unsaved. After `ui_svg_save` the asset holds the new markup.

If a call fails, the draft stays as it was:

- `ui_svg_set_markup` with markup that does not parse: "The markup was not applied".
- `ui_svg_replace` whose result does not parse: "The replacement was not applied".
- `find` that is absent: "does not occur". `find` that occurs more than once: add surrounding markup until it matches one place.

---

## Related

- [Workspaces](workspaces.md) for tabs, projects, and the View / Edit toggle
- [Asset Management](asset-management.md) for the assets these documents are stored as
- [Sketch Editor](sketch-editor.md) for raster painting
