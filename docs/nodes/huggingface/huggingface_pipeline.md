# nodetool.nodes.huggingface.huggingface_pipeline

## HuggingFacePipelineNode

**Fields:**

### load_model

**Args:**
- **context (ProcessingContext)**
- **model_class (type[~T])**
- **model_id (str)**
- **variant (str | None) (default: fp16)**
- **torch_dtype (torch.dtype | None) (default: torch.float16)**
- **path (str | None) (default: None)**
- **skip_cache (bool) (default: False)**
- **kwargs (Any)**

**Returns:** ~T

### load_pipeline

**Args:**
- **context (ProcessingContext)**
- **pipeline_task (str)**
- **model_id (Any)**
- **device (str | None) (default: None)**
- **torch_dtype (torch.dtype | None) (default: torch.float16)**
- **kwargs (Any)**

### move_to_device

**Args:**
- **device (str)**

### requires_gpu

**Args:**

**Returns:** bool

### should_skip_cache

**Args:**


