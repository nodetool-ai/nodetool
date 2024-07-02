# nodetool.providers.openai.cost_calculation

## Function: `calculate_cost(model: str, input_tokens: int, output_tokens: int | None = None) -> float`

**Parameters:**

- `model` (str)
- `input_tokens` (int)
- `output_tokens` (int | None) (default: `None`)

**Returns:** `float`

## Function: `calculate_cost_for_completion_usage(model: str, usage: openai.types.completion_usage.CompletionUsage)`

**Parameters:**

- `model` (str)
- `usage` (CompletionUsage)

## Function: `calculate_cost_for_embedding_usage(model: str, usage: openai.types.create_embedding_response.Usage)`

**Parameters:**

- `model` (str)
- `usage` (Usage)

