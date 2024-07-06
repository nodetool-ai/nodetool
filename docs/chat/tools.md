# nodetool.chat.tools

## ProcessNodeTool

## Tool

#### `tool_param`

**Parameters:**


**Returns:** `ChatToolParam`

#### `function_tool_from_workflow`

Create a function tool from a workflow.

    Args:
        context (ProcessingContext): The processing context.
        workflow_id (str): The ID of the workflow.

    Returns:
        ChatCompletionToolParam: The chat completion tool parameter.

    Raises:
        ValueError: If the workflow does not exist.

**Parameters:**

- `context` (ProcessingContext)
- `workflow_id` (str)

#### `process_workflow_function`

Process a workflow with the given parameters.
    If the node returns a prediction, wait for the prediction to complete.

    Args:
        context (ProcessingContext): The processing context.
        name (str): The workflow_id
        params (dict): The parameters passed to the workflow.

**Parameters:**

- `context` (ProcessingContext)
- `workflow_id` (str)
- `params` (dict)

**Returns:** `Any`

#### `sanitize_node_name`

Sanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The sanitized node name.

**Parameters:**

- `node_name` (str)

**Returns:** `str`

