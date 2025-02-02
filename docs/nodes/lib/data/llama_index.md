# nodetool.nodes.lib.data.llama_index

## HTMLSplitter

Split HTML content into semantic chunks based on HTML tags.

**Tags:** html, text, semantic, tags, parsing

**Fields:**
- **document_id**: Document ID to associate with the HTML content (str)
- **text**: HTML content to split (str)


## JSONSplitter

Split JSON content into semantic chunks.

**Tags:** json, parsing, semantic, structured

**Fields:**
- **document_id**: Document ID to associate with the JSON content (str)
- **text**: JSON content to split (str)
- **include_metadata**: Whether to include metadata in nodes (bool)
- **include_prev_next_rel**: Whether to include prev/next relationships (bool)


## SemanticSplitter

Split text semantically.

**Tags:** chroma, embedding, collection, RAG, index, text, markdown, semantic

**Fields:**
- **embed_model**: Embedding model to use (LlamaModel)
- **document_id**: Document ID to associate with the text content (str)
- **text**: Text content to split (str)
- **buffer_size**: Buffer size for semantic splitting (int)
- **threshold**: Breakpoint percentile threshold for semantic splitting (int)


## SentenceSplitter

Splits text into chunks of a minimum length.

Use cases:
- Splitting text into manageable chunks for processing
- Creating traceable units for analysis or storage
- Preparing text for language model processing

**Tags:** text, split, sentences

**Fields:**
- **text** (str)
- **min_length** (int)
- **source_id** (str)
- **chunk_size** (int)
- **chunk_overlap** (int)


