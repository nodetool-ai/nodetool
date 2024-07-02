# nodetool.nodes.openai.text

## Embedding

Generates a vector representation of text for measuring relatedness.
Outputs a text embedding vector that quantifies the semantic similarity of the input text to other text strings. An embedding is a vector (list) of floating point numbers. The distance between two vectors measures their relatedness. Small distances suggest high relatedness and large distances suggest low relatedness. Use cases: Search, Clustering, Recommendations, Anomaly detection, Diversity measurement, Classification

**Tags:** text, analyse, transform, embeddings, relatedness, search, classification, clustering, recommendations

**Inherits from:** BaseNode

- **input** (`str | nodetool.metadata.types.TextRef`)
- **model** (`EmbeddingModel`)
- **chunk_size** (`int`)

## EmbeddingModel

**Inherits from:** str, Enum

## GPT

Use GPT models for generating natural language responses based on input prompts.
Produces natural language text as a response to the input query, leveraging the capabilities of GPT models for various applications.

**Tags:** text, llm, t2t, ttt, text-to-text, generate, gpt, chat, chatgpt

**Inherits from:** BaseNode

- **model** (`GPTModel`)
- **system** (`str`)
- **prompt** (`str`)
- **image** (`ImageRef`)
- **presence_penalty** (`float`)
- **frequency_penalty** (`float`)
- **temperature** (`float`)
- **max_tokens** (`int`)
- **top_p** (`float`)
- **response_format** (`ResponseFormat`)

## ResponseFormat

**Inherits from:** str, Enum

