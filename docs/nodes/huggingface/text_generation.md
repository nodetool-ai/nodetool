# nodetool.nodes.huggingface.text_generation

## TextGeneration

Generates text based on a given prompt.

Use cases:
- Creative writing assistance
- Automated content generation
- Chatbots and conversational AI
- Code generation and completion

**Tags:** text, generation, natural language processing

**Fields:**
- **model**: The model ID to use for the text generation (HFTextGeneration)
- **prompt**: The input text prompt for generation (str)
- **max_new_tokens**: The maximum number of new tokens to generate (int)
- **temperature**: Controls randomness in generation. Lower values make it more deterministic. (float)
- **top_p**: Controls diversity of generated text. Lower values make it more focused. (float)
- **do_sample**: Whether to use sampling or greedy decoding (bool)

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


