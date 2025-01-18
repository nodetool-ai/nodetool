# nodetool.common.chroma_client

### get_chroma_client

Get a ChromaDB client instance.


**Args:**

- **user_id (str | None)**: User ID for tenant creation. Required for remote connections.
- **existing_client (ClientAPI | None)**: Existing ChromaDB client to reuse if provided.


**Returns:**

- **ClientAPI**: ChromaDB client instance
**Args:**
- **user_id (str | None) (default: None)**

### get_collection

Get a collection by name.
Automatically handles embedding model selection.
Raises an error if the collection doesn't have embedding model information.


**Args:**

- **name**: The name of the collection.


**Returns:**

The collection.
**Args:**
- **name (str)**

**Returns:** Collection

### split_document

Split text using markdown headers and/or chunk size.


**Args:**

- **text**: Text content to split
- **chunk_size**: Optional size for further chunking
- **chunk_overlap**: Overlap between chunks when using chunk_size
- **separators**: List of separators to use for splitting, in order of preference


**Returns:**

List of dictionaries containing split text and metadata
**Args:**
- **text (str)**
- **source_id (str)**
- **chunk_size (int) (default: 2000)**
- **chunk_overlap (int) (default: 1000)**
- **separators (typing.List[str]) (default: ['\n\n', '\n', '.'])**

**Returns:** typing.List[nodetool.metadata.types.TextChunk]

