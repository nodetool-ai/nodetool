# nodetool.providers.openai.cost_calculation

### calculate_cost

**Args:**
- **model (str)**
- **input_tokens (int)**
- **output_tokens (int | None) (default: None)**

**Returns:** float

### calculate_cost_for_completion_usage

**Args:**
- **model (str)**
- **usage (CompletionUsage)**

### calculate_cost_for_embedding_usage

**Args:**
- **model (str)**
- **usage (Usage)**

