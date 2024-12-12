# nodetool.nodes.huggingface.token_classification

## TokenClassification

Performs token classification tasks such as Named Entity Recognition (NER).

Use cases:
- Named Entity Recognition in text
- Part-of-speech tagging
- Chunking and shallow parsing
- Information extraction from unstructured text

**Tags:** text, token classification, named entity recognition, natural language processing

**Fields:**
- **model**: The model ID to use for token classification (HFTokenClassification)
- **inputs**: The input text for token classification (str)
- **aggregation_strategy**: Strategy to aggregate tokens into entities (AggregationStrategy)

### initialize

**Args:**
- **context (ProcessingContext)**


