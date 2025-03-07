# nodetool.api.collection

## CollectionCreate

**Fields:**
- **name** (str)
- **embedding_model** (str)


## CollectionList

**Fields:**
- **collections** (typing.List[nodetool.api.collection.CollectionResponse])
- **count** (int)


## CollectionModify

**Fields:**
- **name** (str | None)
- **metadata** (dict[str, str] | None)


## CollectionResponse

**Fields:**
- **name** (str)
- **count** (int)
- **metadata** (typing.Dict[str, typing.Any])
- **workflow_name** (str | None)


## IndexFile

**Fields:**
- **path** (str)
- **mime_type** (str)


## IndexResponse

**Fields:**
- **path** (str)
- **error** (typing.Optional[str])


### chunk_documents_recursive

Split documents into chunks using LangChain's recursive character splitting.
This method provides more semantic splitting by attempting to break at natural
text boundaries.


**Args:**

- **documents**: List of documents to split
- **chunk_size**: Maximum size of each chunk in characters
- **chunk_overlap**: Number of characters to overlap between chunks


**Returns:**

Tuple of (id_to_text_mapping, metadata_list)
**Args:**
- **documents (typing.List[llama_index.core.schema.Document])**
- **chunk_size (int) (default: 4096)**
- **chunk_overlap (int) (default: 2048)**

**Returns:** tuple[dict[str, str], list[dict]]

### create_collection

Create a new collection
**Args:**
- **req (CollectionCreate)**
- **user (User) (default: Depends(current_user))**

**Returns:** CollectionResponse

### default_ingestion_workflow

Process a file and add it to the collection using the default ingestion workflow.


**Args:**

- **collection**: ChromaDB collection to add documents to
- **file_path**: Path to the file to process
- **mime_type**: MIME type of the file
**Args:**
- **collection (Collection)**
- **file_path (str)**
- **mime_type (str)**

**Returns:** None

### delete_collection

Delete a collection
**Args:**
- **name (str)**
- **user (User) (default: Depends(current_user))**

### find_input_nodes

Find the collection input and file input node names from a workflow graph.


**Args:**

- **graph**: The workflow graph to search


**Returns:**

Tuple of (collection_input_name, file_input_name) where each may be None if not found
**Args:**
- **graph (dict)**

**Returns:** tuple[str | None, str | None]

### get

Get a specific collection by name
**Args:**
- **name (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** CollectionResponse

### index

**Args:**
- **name (str)**
- **file (IndexFile)**
- **user (User) (default: Depends(current_user))**

**Returns:** IndexResponse

### list_collections

List all collections
**Args:**
- **offset (typing.Optional[int]) (default: None)**
- **limit (typing.Optional[int]) (default: None)**
- **user (User) (default: Depends(current_user))**

**Returns:** CollectionList

### update_collection

Update a collection
**Args:**
- **name (str)**
- **req (CollectionModify)**
- **user (User) (default: Depends(current_user))**

