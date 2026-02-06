# Workflow Runner Guidelines

**Navigation**: [Root AGENTS.md](../AGENTS.md) → **Workflow Runner**

## Overview

Standalone HTML/JavaScript application for running NodeTool workflows without the full editor. Used for embedding, sharing, and testing workflows.

## Usage

```
# Open in browser with workflow ID
https://your-domain.com/workflow_runner/?workflow=<workflow-id>

# Embed in a page
<iframe src="workflow_runner/?workflow=<id>" width="100%" height="600"></iframe>
```

## Configuration

- Set `window.NODETOOL_API_URL` or default to `http://localhost:7777`.
- Pass `workflow` ID via URL query parameter.
- Optional: `theme` (light/dark), `showHeader` (true/false).

## Rules

- Validate all user inputs before sending to the API.
- Display user-friendly error messages.
- Show progress indicators during workflow execution.
- Use semantic HTML and ARIA labels for accessibility.
- Support responsive layouts for mobile devices.
