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

**Fields:**
input: str | nodetool.metadata.types.TextRef
model: EmbeddingModel
chunk_size: int

## EmbeddingModel

An enumeration.

## GPT

Generate natural language responses using GPT models.

Leverages OpenAI's GPT models to:
- Generate human-like text responses
- Answer questions
- Complete prompts
- Engage in conversational interactions
- Assist with writing and editing tasks
- Perform text analysis and summarization

**Fields:**
model: GPTModel
system: str
prompt: str
image: ImageRef
presence_penalty: float
frequency_penalty: float
temperature: float
max_tokens: int
top_p: float

## ResponseFormat

An enumeration.

