# nodetool.nodes.ollama.text

## Embedding

Generates a vector representation of text for measuring relatedness.
Outputs a text embedding vector that quantifies the semantic similarity of the input text to other text strings. An embedding is a vector (list) of floating point numbers. The distance between two vectors measures their relatedness. Small distances suggest high relatedness and large distances suggest low relatedness. Use cases: Search, Clustering, Recommendations, Anomaly detection, Diversity measurement, Classification

**Tags:** text, analyse, transform, embeddings, relatedness, search, classification, clustering, recommendations

**Inherits from:** BaseNode

- **input** (`str | nodetool.metadata.types.TextRef`)
- **model** (`LlamaModel`)
- **chunk_size**: The size of the chunks to split the input into (`int`)

## Ollama

Run Llama models.

**Inherits from:** BaseNode

- **model**: The Llama model to use. (`LlamaModel`)
- **prompt**: Prompt to send to the model. (`str`)
- **system_prompt**: System prompt to send to the model. (`str`)
- **temperature**: The temperature to use for the model. (`float`)
- **top_k**: The number of highest probability tokens to keep for top-k sampling. (`int`)
- **top_p**: The cumulative probability cutoff for nucleus/top-p sampling. (`float`)

