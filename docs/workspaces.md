---
layout: page
title: "Workspaces"
description: "Configure workspace folders that NodeTool can access."
---

A **workspace** is a folder that NodeTool can safely access for reading and writing files during workflow runs, agent tasks, and chat sessions.

## Why workspaces exist

Workspaces make local file access explicit and controlled:

- Keep project files organized under known roots
- Limit file operations to approved directories
- Share the same folder roots across workflows and agent tools

## Manage workspaces in the app

Workspaces have their own full-screen page at `/workspaces` (not a Settings tab):

1. Open the app menu (click the logo at the top of the left rail).
2. Choose **Workspaces** (shown when workspaces are enabled).
3. Add one or more workspace directories on the Workspaces page.

After adding a workspace, NodeTool can browse files, list folders, and read/write files inside the configured root.

## Where workspaces are used

- **Agents and chat tools** for file operations
- **Workflow nodes** in the `lib.os` namespace (file read/write, path, and filesystem operations)
- **Project organization** when working with local assets and generated outputs

## Related docs

- [Workflow Editor](workflow-editor.md)
- [Storage Guide](storage.md)
- [Node Reference: `lib.os`](nodes/lib/os/)
