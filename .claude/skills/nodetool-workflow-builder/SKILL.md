---
name: nodetool-workflow-builder
description: "Create or edit NodeTool workflow graphs, connections, and properties using UI, headless tools, or requested workflow files."
---

# Build NodeTool workflows

Create or edit a workflow that produces the requested outputs from the specified
inputs. Preserve existing nodes and connections outside the requested change.
A request for a finished video alone belongs to the matching storyboard skill.

Use the authoring surface the user requested. Prefer available UI tools for a
visible canvas, headless workflow tools for saved graphs, and JSON or the
TypeScript DSL when a workflow file is requested. Do not claim a missing tool is
callable. Use the live schemas and registry as the source of identifiers.

## Build and verify

1. Inspect the existing graph for edits. Identify required inputs, outputs, and
   behavior from the request and existing context.
2. Search required node types with `include_properties=true` and
   `include_outputs=true`. Reuse metadata already retrieved for the same type.
   Discover model choices through available model-search tools. Do not invent
   node types, properties, handles, or model identifiers.
3. Add or update nodes, set required properties, and connect compatible handles.
   Keep existing layout and identifiers when editing. Read
   [graph-authoring.md](references/graph-authoring.md) for the relevant tool,
   streaming pattern, or DSL operation before using it.
4. Validate through `ui_get_graph` or `validate_workflow` as appropriate. Fix
   errors and required-input warnings. Read back the saved graph before claiming
   it was created or changed. Report any remaining limitation.
5. Execute only when the request includes a run. Respect generation budgets and
   tool permissions. Report the workflow identifier, inputs, validation result,
   and actual run outcome when executed.

If a node is unavailable, broaden the search and inspect supported alternatives.
Proceed with an equivalent composition when it preserves the requested behavior.
Otherwise explain the missing capability and ask only for the decision needed to
choose an alternative. Continue independent work on the rest of the graph.
