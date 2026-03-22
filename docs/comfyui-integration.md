---
layout: page
title: "ComfyUI Integration"
description: "Use ComfyUI workflows in NodeTool: setup, run, and troubleshoot."
---

# ComfyUI Integration

NodeTool lets you run ComfyUI workflows from the same editor you already use for NodeTool workflows.

## What You Can Do

- Open and edit Comfy-based workflows in NodeTool
- Run them directly from the **Run** button
- Watch progress in the UI while the workflow is running
- Save and re-open your workflow like any other project

## Before You Start

Make sure:

- ComfyUI is running on your machine (or reachable from your NodeTool setup)
- NodeTool can connect to your ComfyUI URL in **ComfyUI Settings**
- Your workflow mode is set to **Comfy**

## How To Run a Comfy Workflow

1. Open your workflow in the editor.
2. Set mode to **Comfy**.
3. Click **Run**.
4. Watch node states update while the workflow executes.
5. When complete, outputs appear in the usual result areas.

## What You’ll See During Execution

- Nodes move through running/completed states
- Progress updates for longer-running steps
- Final outputs once processing is done
- Errors shown in notifications/logs if something fails

If a run completes, NodeTool now automatically clears any lingering “running” node states.

## Common Issues

### Run does nothing
- Confirm ComfyUI is running
- Check ComfyUI URL in settings
- Verify workflow mode is **Comfy**

### Some nodes stay running forever
- Re-run once after updating to the latest version
- Check logs for completion events
- If it keeps happening, share logs from the run

### Workflow mode switches back after save
- This should no longer happen in current builds
- If you still see it, report your version and steps

### You get “invalid node type” errors
- Usually means the workflow is being run in non-Comfy mode
- Switch mode to **Comfy** and run again

## Tips

- Keep ComfyUI and NodeTool updated to reduce compatibility issues
- Save before running large workflows
- Use clear node names to make run status easier to follow

## Need Help?

If you still have issues, check:
- `/Users/mg/workspace/nodetool/docs/troubleshooting.md`
- `/Users/mg/workspace/nodetool/docs/workflow-editor.md`
