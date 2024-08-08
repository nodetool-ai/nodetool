# nodetool.providers.huggingface.huggingface_node

## HuggingfaceNode


### convert_output

**Args:**
- **context (ProcessingContext)**
- **output (typing.Any)**

**Returns:** typing.Any

### extra_params

**Args:**
- **context (ProcessingContext)**

**Returns:** dict

### run_huggingface

**Args:**
- **model_id (str)**
- **context (ProcessingContext)**
- **params (dict[str, typing.Any] | None) (default: None)**
- **data (bytes | None) (default: None)**

**Returns:** typing.Any

### progress_callback

**Args:**
- **node_id (str)**
- **total_steps (int)**
- **context (ProcessingContext)**

