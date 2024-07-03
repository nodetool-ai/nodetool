# nodetool.providers.openai.cost_calculation

#### `calculate_cost`

**Parameters:**

- `model` (str)
- `input_tokens` (int)
- `output_tokens` (int | None) (default: `None`)

**Returns:** `float`

#### `calculate_cost_for_completion_usage`

**Parameters:**

- `model` (str)
- `usage` (CompletionUsage)

#### `calculate_cost_for_embedding_usage`

**Parameters:**

- `model` (str)
- `usage` (Usage)

