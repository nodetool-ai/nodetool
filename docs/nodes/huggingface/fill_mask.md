# nodetool.nodes.huggingface.fill_mask

## FillMask

Fills in a masked token in a given text.

Use cases:
- Text completion
- Sentence prediction
- Language understanding tasks
- Generating text options

**Tags:** text, fill-mask, natural language processing

**Fields:**
- **model**: The model ID to use for fill-mask task (HFFillMask)
- **inputs**: The input text with [MASK] token to be filled (str)
- **top_k**: Number of top predictions to return (int)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


