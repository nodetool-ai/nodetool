---
layout: page
title: "ComfyUI Integration"
description: "Run ComfyUI workflows inside NodeTool — import, edit, and execute them as native graphs."
---

NodeTool can load, edit, and run ComfyUI workflows directly on its canvas. ComfyUI nodes appear as regular NodeTool nodes, so you can mix them with native NodeTool nodes, rearrange them freely, and run them without leaving the app.

> **Prerequisites:** You need a running ComfyUI instance. The default address is `http://127.0.0.1:8188`. Start ComfyUI before connecting.

---

## Connecting to ComfyUI

1. Open **Settings** and go to the **ComfyUI** section.
2. Enter your ComfyUI URL (default: `http://127.0.0.1:8188`).
3. Click **Connect**.

A green status indicator confirms the connection. Once connected, NodeTool fetches all available node types from ComfyUI and registers them in the node menu under the **ComfyUI** category.

If the status stays red, see [Troubleshooting](#troubleshooting) below.

---

## Importing a ComfyUI Workflow

Drop a ComfyUI workflow file onto the canvas — either a **`.json`** export or a **`.png`** with embedded workflow metadata.

NodeTool converts the workflow to its native graph format:

- Each ComfyUI node becomes a canvas node
- Links become edges
- Node positions, sizes, and widget values are preserved

You can then edit the graph just like any other NodeTool workflow: move nodes, change values, and add connections.

---

## Running a Workflow

Click **Run** as usual. NodeTool detects ComfyUI nodes in the graph and automatically routes execution to the ComfyUI backend. Progress streams back in real time.

Node states update as execution proceeds — you can watch each step move through running and completed states. Outputs appear in the result areas when the run finishes.

> Hybrid workflows that mix ComfyUI nodes with native NodeTool nodes are planned for a future release.

---

## Exporting Back to ComfyUI

Use **File → Export → Export as ComfyUI Workflow** to save the graph as a ComfyUI-compatible `.json` file. This file can be loaded directly into a standalone ComfyUI instance.

---

## Node Appearance

ComfyUI nodes are visually distinguished on the canvas with a teal border so you can tell at a glance which nodes route to the ComfyUI backend.

---

## Supported Data Types

NodeTool maps ComfyUI data types to its own type system so connections are validated correctly:

| ComfyUI Type | NodeTool Type |
|---|---|
| `IMAGE` | `comfy.image_tensor` |
| `LATENT` | `comfy.latent` |
| `MODEL` | `comfy.unet` |
| `CLIP` | `comfy.clip` |
| `VAE` | `comfy.vae` |
| `CONDITIONING` | `comfy.conditioning` |
| `CONTROL_NET` | `comfy.control_net` |
| `MASK` | `comfy.mask` |
| `SAMPLER` | `comfy.sampler` |
| `SIGMAS` | `comfy.sigmas` |
| `INT` / `FLOAT` / `STRING` / `BOOLEAN` | Standard primitives |

---

## Configuration

The ComfyUI backend URL is saved in your browser's local storage and persists across sessions. No environment variables are required — all configuration is done through the Settings UI.

Default URL: `http://127.0.0.1:8188`

---

## Troubleshooting

### Can't connect

- Confirm ComfyUI is running and accessible at the URL you entered.
- If NodeTool and ComfyUI run on different origins, enable CORS in your ComfyUI configuration.
- Check that your browser or Electron app supports WebSocket connections.

### Nodes don't appear in the menu after connecting

- Disconnect and reconnect to refresh the node list.
- Verify the ComfyUI instance is fully loaded (the `/object_info` endpoint must be reachable).
- Check the browser or app console for errors.

### Workflow fails to run

- Make sure all required node inputs are connected or have explicit values.
- Check the ComfyUI backend logs for execution errors.
- Confirm the WebSocket connection is still active (status indicator should be green).

### "Invalid node type" errors

- This usually means the workflow contains ComfyUI node types that haven't been registered yet. Connect to ComfyUI first so those node definitions are loaded, then open the workflow again.

### Some nodes stay in a running state after the workflow finishes

- Re-run the workflow once after updating to the latest version of NodeTool.
- If it keeps happening, share the logs from that run so we can investigate.

---

## Related

- [Workflow Editor](workflow-editor.md) — canvas navigation and node controls
- [Getting Started](getting-started.md) — run your first NodeTool workflow
- [Models and Providers](models-and-providers.md) — other AI backends supported by NodeTool
- [Troubleshooting](troubleshooting.md) — general troubleshooting guide
