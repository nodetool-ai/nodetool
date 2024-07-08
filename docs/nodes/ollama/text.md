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

- **input** (str | nodetool.metadata.types.TextRef)
- **model** (LlamaModel)
- **chunk_size**: The size of the chunks to split the input into (int)

## Ollama

Run Llama models to generate text responses.

Use cases:
- Generate creative writing or stories
- Answer questions or provide explanations
- Assist with tasks like coding, analysis, or problem-solving
- Engage in open-ended dialogue on various topics

**Tags:** llama, text generation, language model, ai assistant

- **model**: The Llama model to use. (LlamaModel)
- **prompt**: Prompt to send to the model. (str)
- **system_prompt**: System prompt to send to the model. (str)
- **temperature**: The temperature to use for the model. (float)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (int)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (float)

