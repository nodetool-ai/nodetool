---
layout: page
title: "VibeCoding"
description: "Design custom workflow UIs with AI assistance"
---

VibeCoding is NodeTool's AI-powered tool for designing custom user interfaces for your workflows. Describe what you want in natural language, and VibeCoding generates a fully functional HTML app that runs your workflow.

## Overview

VibeCoding provides:

- **AI-Powered Design**: Describe your desired UI in natural language
- **Live Preview**: See changes in real-time as HTML is generated
- **Seamless Integration**: Generated apps run your workflow with full API access
- **No Coding Required**: Create professional interfaces without writing code
- **Instant Deployment**: Save and share your custom app immediately

## Getting Started

### Opening VibeCoding

1. **From Mini App View**: Open a workflow in App Mode, then click the settings panel (gear icon) and select **Design App UI**
2. **From Side Panel**: In the Mini App side panel, click the **Design App UI** button

### Interface Layout

VibeCoding opens in a split-panel modal:

| Area | Location | Purpose |
|------|----------|---------|
| **Chat** | Left panel (40%) | Describe your UI, ask for changes |
| **Preview** | Right panel (60%) | Live preview of generated app |
| **Header** | Top | Save, Clear App, Close buttons |

## Using VibeCoding

### Step 1: Describe Your UI

In the chat panel, describe what you want your app to look like. Be as specific or general as you like:

**Simple requests:**
> "Create a dark-themed interface with a gradient background"

**Detailed requests:**
> "I want a professional dashboard with a sidebar for inputs, a large central area for the main output, and a modern card-based design with rounded corners"

**Specific styling:**
> "Make it look like a social media app with a purple and pink color scheme, floating buttons, and smooth animations"

### Step 2: Review the Preview

As the AI generates HTML, the preview panel updates in real-time. You can:

- **Watch generation**: See the interface build as HTML streams in
- **Test interactivity**: The preview is fully functional
- **Iterate quickly**: Ask for changes and see immediate results

### Step 3: Refine Your Design

Continue the conversation to refine your app:

> "Make the buttons larger and add more padding"

> "Change the background to a gradient from blue to purple"

> "Add a loading spinner when the workflow is running"

### Step 4: Save Your App

When you're happy with the design:

1. Click the **Save** button in the header
2. The HTML is saved to your workflow's `html_app` field
3. Your custom app is now live in Mini App mode

## Preview Controls

The preview panel includes several helpful controls:

| Button | Action |
|--------|--------|
| **Refresh** | Force a complete refresh of the preview |
| **Open in New Tab** | Open the app in a full browser tab |
| **View Source** | Inspect the generated HTML (when available) |

## Templates

VibeCoding may show template chips at the start of a conversation. These are pre-built prompts for common UI patterns:

- Click a template to instantly send that prompt
- Templates help you get started quickly with proven designs

## Managing Custom Apps

### Unsaved Changes

- A **yellow dot** appears next to the title when you have unsaved changes
- Closing with unsaved changes prompts you to Save, Discard, or Cancel
- Browser navigation shows a warning when changes are unsaved

### Clearing a Custom App

To remove a custom app and return to the default Mini App interface:

1. Click **Clear App** (trash icon) in the header
2. Confirm in the dialog that appears
3. The workflow reverts to the standard input/output interface

### Editing an Existing App

If your workflow already has a custom app:

1. Open VibeCoding – the existing app loads in the preview
2. Ask for modifications in the chat
3. The AI considers your current design when making changes

## How It Works

### Generated App Features

VibeCoding generates self-contained HTML apps that include:

- **Runtime Configuration**: Automatic injection of API and WebSocket URLs
- **Workflow Integration**: Full access to run your workflow via API
- **Asset Support**: Load and display assets from your workflow
- **Responsive Design**: Apps work on various screen sizes

### Security

Generated apps run in a sandboxed iframe with controlled permissions:

- `allow-scripts`: Enable JavaScript execution
- `allow-forms`: Enable form submissions
- `allow-same-origin`: Enable localStorage and API access
- `allow-modals`: Enable alert/confirm dialogs

## Tips for Better Results

### Be Specific About Style

Instead of: "Make it look nice"

Try: "Use a dark theme with neon accents, glass-morphism cards, and subtle shadows"

### Describe Layout Clearly

Instead of: "Show the inputs and outputs"

Try: "Put inputs in a left sidebar (25% width), the main output in the center (75%), and add a status bar at the bottom"

### Mention Interactivity

If you want specific behaviors:

> "Show a progress bar while the workflow runs"

> "Display the output image in a modal when clicked"

> "Add a copy button next to text outputs"

### Reference Existing Designs

Feel free to reference known patterns:

> "Like a ChatGPT interface but for image generation"

> "Similar to a Notion page with clean typography"

## Troubleshooting

### Preview Not Updating

- Click the **Refresh** button in the preview header
- Check the chat for any error messages
- Ensure the generated HTML is valid

### App Not Running Workflow

- Verify the workflow has proper input/output schema
- Check browser console for JavaScript errors
- Ensure API endpoints are accessible

### Lost Changes

- VibeCoding saves sessions locally per workflow
- Unsaved HTML persists across browser refreshes
- Use **Save** frequently to preserve your work

## Related Topics

- [Workflow Editor](workflow-editor.md) – Build workflows visually
- [Global Chat](global-chat.md) – AI assistant interface
- [User Interface](user-interface.md) – UI overview
- [Key Concepts](key-concepts.md) – Core NodeTool concepts
