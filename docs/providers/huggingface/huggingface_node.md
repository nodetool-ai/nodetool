# nodetool.providers.huggingface.huggingface_node

## HuggingfaceNode

**Inherits from:** BaseNode


#### `convert_output(self, context: nodetool.workflows.processing_context.ProcessingContext, output: Any) -> Any`

**Parameters:**

- `context` (ProcessingContext)
- `output` (Any)

**Returns:** `Any`

#### `extra_params(self, context: nodetool.workflows.processing_context.ProcessingContext) -> dict`

**Parameters:**

- `context` (ProcessingContext)

**Returns:** `dict`

#### `run_huggingface(self, model_id: str, context: nodetool.workflows.processing_context.ProcessingContext, params: dict[str, typing.Any] | None = None, data: bytes | None = None) -> Any`

**Parameters:**

- `model_id` (str)
- `context` (ProcessingContext)
- `params` (dict[str, typing.Any] | None) (default: `None`)
- `data` (bytes | None) (default: `None`)

**Returns:** `Any`

