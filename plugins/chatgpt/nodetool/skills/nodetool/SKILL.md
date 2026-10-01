---
name: nodetool
description: Use the NodeTool MCP server to build, validate, run, and debug visual AI workflows, and to work with assets, collections, and jobs. Use when the user mentions NodeTool or asks for a workflow graph, a node, or a media generation run on their NodeTool server.
---

# NodeTool

The NodeTool MCP server exposes one action tool, `execute_code`, plus a few
direct tools. Write JavaScript for `execute_code`. The code runs in a sandbox
and reaches NodeTool through the `nodetool.*` object model.

## Find what exists first

1. Call `nodetool.searchTools("query")` inside an action to find a capability.
2. Read the `nodetool://capabilities` resource for the tool list and
   `nodetool://sandbox` for the guest surface.
3. Search the node registry (`search_nodes`, `get_node_info`) before naming a
   node type. Never guess a type or a property name.

## Build and run a workflow

1. `create_workflow` with the graph, or `get_example_workflow` to start from a
   shipped example.
2. `validate_workflow` after every edit. It is a static check and returns in
   under a second. It catches unknown node types, missing required properties,
   unselected models, and dangling or mistyped edges.
3. `run_workflow` for a short run, or `start_background_job` for a long one.
   Poll `get_job` until it settles. The settled job carries `outputs`.
   `get_job_logs` carries the log tail and any node error. Inspect that same
   job. Do not start another run to read its result.

## Debug a failed run

`debug_workflow` starts a new execution. It does not inspect the job from step
3. Call it only when a second run is intended and the user has authorized it,
because a rerun can repeat charges and side effects. After an ordinary run,
use `get_job` and `get_job_logs` first.

## Rules

- Validate before running. A run can cost money.
- Start one execution per request. Never run a workflow and then debug-run it
  to read the result.
- Ask before deleting a workflow, asset, collection, or version.
- Report the job status and the real error text when a run fails. Do not
  retry blindly.
- Media generations are tracked. Pass `background: true` to get a
  `generation_id` early, then use `await_generation`.
- Resource ids may be shortened to 12 characters in results. Pass back the form
  you were given.
