# nodetool.nodes.nodetool.group

## Loop

Loops over a list of items and processes the remaining nodes for each item.

**Tags:** loop, itereate, repeat, for, each, batch

**Inherits from:** GroupNode


#### `process_subgraph`

Runs a loop node, which is a special type of node that contains a subgraph.
        The subgraph is determined by the children property of the group node.
        Each iteration of the loop will run the subgraph with the input data from the input nodes.
        The output will be collected and stored in the output nodes.

**Parameters:**

- `context` (ProcessingContext)
- `runner` (WorkflowRunner)

**Returns:** `Any`

