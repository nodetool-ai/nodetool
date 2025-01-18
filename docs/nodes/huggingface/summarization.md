# nodetool.nodes.huggingface.summarization

## Summarize

Summarizes text using a Hugging Face model.

**Tags:** text, summarization, AI, LLM

**Fields:**
- **model**: The model ID to use for the text generation (HFTextGeneration)
- **inputs**: The input text to summarize (str)
- **max_length**: The maximum length of the generated text (int)
- **do_sample**: Whether to sample from the model (bool)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


