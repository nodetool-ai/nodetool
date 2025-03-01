# nodetool.nodes.openai.text

## Embedding

Generate vector representations of text for semantic analysis.

Uses OpenAI's embedding models to create dense vector representations of text.
These vectors capture semantic meaning, enabling:
- Semantic search
- Text clustering
- Document classification
- Recommendation systems
- Anomaly detection
- Measuring text similarity and diversity

**Tags:** embeddings, similarity, search, clustering, classification

**Fields:**
- **input** (str)
- **model** (EmbeddingModel)
- **chunk_size** (int)


## EmbeddingModel

## OpenAIText

Generate natural language responses using OpenAI models.

Leverages OpenAI's GPT models to:
- Generate human-like text responses
- Answer questions
- Complete prompts
- Engage in conversational interactions
- Assist with writing and editing tasks
- Perform text analysis and summarization

**Tags:** llm, text-generation, chatbot, question-answering

**Fields:**
- **model** (OpenAIModel)
- **system** (str)
- **prompt** (str)
- **image** (ImageRef)
- **presence_penalty** (float)
- **frequency_penalty** (float)
- **max_tokens** (int)
- **top_p** (float)


## ResponseFormat

