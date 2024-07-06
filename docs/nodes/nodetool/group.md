# nodetool.nodes.nodetool.group

## Loop

Loops over a list of items and processes the remaining nodes for each item.

Use cases:
- Loop over a list of items and process the nodes inside the group

**Tags:** loop, itereate, repeat, for, each, batch


#### `process_subgraph`

Runs a loop node, which is a special type of node that contains a subgraph.
        The subgraph is determined by the children property of the group node.
        Each iteration of the loop will run the subgraph with the input data from the input nodes.
        The output will be collected and stored in the output nodes.

**Parameters:**

- `context` (ProcessingContext)
- `runner` (WorkflowRunner)

**Returns:** `Any`

