# nodetool.nodes.ollama.text

## Embedding

Generate vector representations of text for semantic similarity.

Use cases:
- Power semantic search capabilities
- Enable text clustering and categorization
- Support recommendation systems
- Detect semantic anomalies or outliers
- Measure text diversity or similarity
- Aid in text classification tasks

**Tags:** embeddings, semantic analysis, text similarity, search, clustering

**Fields:**
- **input** (str)
- **model** (LlamaModel)
- **context_window**: The context window size to use for the model. (int)
- **chunk_size**: The size of the chunks to split the input into (int)


## Ollama

Run Llama models to generate text responses.

Use cases:
- Generate creative writing or stories
- Answer questions or provide explanations
- Assist with tasks like coding, analysis, or problem-solving
- Engage in open-ended dialogue on various topics

**Tags:** LLM, llama, text generation, language model, ai assistant

**Fields:**
- **model**: The Llama model to use. (LlamaModel)
- **prompt**: Prompt to send to the model. (str)
- **image**: The image to analyze (ImageRef)
- **system_prompt**: System prompt to send to the model. (str)
- **messages**: History of messages to send to the model. (list[nodetool.metadata.types.Message])
- **context_window**: The context window size to use for the model. (int)
- **num_predict**: The number of tokens to predict. (int)
- **temperature**: The temperature to use for the model. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)
- **keep_alive**: The number of seconds to keep the model alive. (int)

### create_message

**Args:**
- **message (Message)**
- **context (ProcessingContext)**

**Returns:** typing.Mapping[str, str | list[str]]


