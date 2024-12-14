# nodetool.nodes.ollama.agents

## DataGenerator

LLM Agent to create a dataframe based on a user prompt.

Use cases:
- Generating structured data from natural language descriptions
- Creating sample datasets for testing or demonstration
- Converting unstructured text into tabular format

**Tags:** llm, dataframe creation, data structuring

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: The user prompt (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)
- **columns**: The columns to use in the dataframe. (RecordType)

### requires_gpu

**Args:**

**Returns:** bool


## SVGGenerator

LLM Agent to create SVG elements based on a user prompt.

Use cases:
- Generating SVG graphics from natural language descriptions
- Creating vector illustrations programmatically
- Converting text descriptions into visual elements

**Tags:** llm, svg generation, vector graphics

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **prompt**: The user prompt for SVG generation (str)
- **temperature**: The temperature to use for sampling. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)

### requires_gpu

**Args:**

**Returns:** bool


