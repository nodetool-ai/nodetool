# nodetool.nodes.chroma.chroma_node

## ChromaNode

**Fields:**

### get_collection

Get an existing collection.


**Args:**

- **context**: The processing context.
- **collection**: The collection to get.
**Args:**
- **context (ProcessingContext)**
- **collection (ChromaCollection)**

### get_or_create_collection

Get or create a collection with the given name.


**Args:**

- **context**: The processing context.
- **collection**: The collection to get or create.
**Args:**
- **context (ProcessingContext)**
- **collection (ChromaCollection)**

### load_results

**Args:**
- **context (ProcessingContext)**
- **ids (list[str])**

**Returns:** list[nodetool.metadata.types.AssetRef]


