# nodetool.nodes.nodetool.vector

## ChromaNode

**Fields:**

## IndexFolder

Index all the assets in a folder.

**Fields:**
folder: FolderRef

## NearestNeighbors

Stores input embeddings in a database and retrieves the nearest neighbors for a query embedding.

**Fields:**
documents: list
query: Tensor
n_neighbors: int

## QueryImage

Query the index for similar images.

**Fields:**
folder: FolderRef
image: ImageRef
n_results: int

## QueryText

Query the index for similar text.

**Fields:**
folder: FolderRef
text: TextRef
n_results: int

