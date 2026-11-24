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
| **New document** | `Untitled.md`, opened in the document editor | [Document Editor](document-editor.md) |
| **Import document…** | A Markdown document from a `.docx`, `.pdf`, `.html` or `.txt` file | [Document Editor](document-editor.md#create-or-open-a-document) |
| **Import Google Doc…** | A Markdown document from a Google Doc link | [Document Editor](document-editor.md#create-or-open-a-document) |
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

**New text file…** lists six templates. Choosing one creates the asset and opens it in **Edit** mode. A Markdown file opens in the [Document Editor](document-editor.md), and the rest open in the editors below.

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

| Mode | CSV and TSV | Everything else |
|---|---|---|
| **View** | A read-only table. The first 2000 rows are shown | Read-only code with syntax highlighting |
| **Edit** | An editable table | Code editor |

The view header shows the file name, the detected language, and a copy button that copies the whole text.

### The code editor

Edit mode uses Monaco with a minimap and word wrap on by default. The language comes from the file extension. A file with no known extension is treated as plain text. The toolbar has **Undo**, **Redo**, **Toggle Word Wrap**, and **Save** (a dot marks unsaved changes). Ctrl+S (Cmd+S on macOS) saves. The toolbar also shows **Find & Replace** and **Format as Code Block** buttons, but they do nothing yet.

### The table editor

CSV and TSV files open as an editable table. On save the file is written as comma-separated (`.csv`) or tab-separated (`.tsv`) text.

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

**Save** (or Ctrl+S, Cmd+S on macOS) is disabled until you change something. A notification confirms the save or shows the error. The file stays an SVG.

### Preview and scripts

For security, the live preview ignores scripts and embedded HTML, while keeping your saved file intact. A drawing that relies on them can look different in the preview than in the raw file.

### Ask the assistant

In edit mode an SVG assistant docks beside the editor (desktop only). It edits the same draft you do, and its edits show in the preview and undo like your own. Nothing is saved until you ask for it.

- "Make the circle red, then save the SVG."
- "Add a thin black border around the drawing."
- "Change the text to say Summer Sale."

Builders driving this from code or MCP: see [Creative Agent Tools](developer/creative-agent-tools.md#documents-games).

---

## Related

- [Workspaces](workspaces.md) for tabs, projects, and the View / Edit toggle
- [Asset Management](asset-management.md) for the assets these documents are stored as
- [Sketch Editor](sketch-editor.md) for raster painting
