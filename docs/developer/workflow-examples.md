---
layout: page
title: "Adding Workflow Templates"
description: "Add a shipped example workflow to the Templates gallery: file locations, requirements, validation, and export."
---

This page is for contributors who add a shipped example workflow to the [Templates Gallery](../templates-gallery.md).

## Where templates live

Shipped templates are JSON files in `packages/base-nodes/nodetool/examples/nodetool-base/`. Their listing metadata (name, description, tags) lives in the `examples` array of `packages/base-nodes/nodetool/package_metadata/nodetool-base.json`.

## Requirements

A new template needs:

1. A graph that does real work and is not a re-skin of an existing example.
2. Empty model fields, a description under 80 characters, and a thumbnail at `packages/base-nodes/nodetool/assets/nodetool-base/<name>.jpg`.
3. A passing validation:

   ```bash
   npm run dev:nodetool -- validate "packages/base-nodes/nodetool/examples/nodetool-base/<name>.json"
   ```

The full checklist, including regenerating the marketing catalog, is in `packages/base-nodes/nodetool/examples/nodetool-base/README_EXAMPLES.md`.

## Export a saved workflow as code

To turn a saved workflow into TypeScript DSL code, run `nodetool workflows export-dsl <id>`. The command is provided by the `cli-workflow` command feature. See the [CLI reference]({{ '/cli' | relative_url }}).
