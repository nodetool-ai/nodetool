# nodetool.nodes.nodetool.text.rerank

## Rerank

This node reranks a list of answers based on a question using a transformer-based model.

**Inherits from:** BaseNode

- **model**: The reranking model to use (`Model`)
- **query**: The question to rerank (`str`)
- **documents**: The answers to be ranked by the model. (`list[str]`)
- **top_k** (`int`)

