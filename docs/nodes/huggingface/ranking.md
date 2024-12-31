# nodetool.nodes.huggingface.ranking

## Reranker

Reranks pairs of text based on their semantic similarity.

Use cases:
- Improve search results ranking
- Question-answer pair scoring
- Document relevance ranking

**Tags:** text, ranking, reranking, natural language processing

**Fields:**
- **model**: The model ID to use for reranking (HFReranker)
- **query**: The query text to compare against candidates (str)
- **candidates**: List of candidate texts to rank (typing.List[str])

### initialize

**Args:**
- **context (ProcessingContext)**

### move_to_device

**Args:**
- **device (str)**


