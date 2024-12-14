# nodetool.chat.help

## AddNodeTool

Tool for creating a new node.

## TutorialTool

Tool for starting a tutorial.

## WorkflowTool

Tool for creating a new workflow.

### create_help_answer

**Args:**
- **messages (list[nodetool.metadata.types.Message])**
- **available_tutorials (list[str])**

**Returns:** list[nodetool.metadata.types.Message]

### get_collection

Get or create a collection with the given name.


**Args:**

- **context**: The processing context.
- **name**: The name of the collection to get or create.
**Args:**
- **name**

**Returns:** Collection

### get_doc_collection

### get_example_collection

### index_documentation

Index the documentation if it doesn't exist yet.
**Args:**
- **collection (Collection)**

### index_examples

Index the examples if they don't exist yet.
**Args:**
- **collection (Collection)**

### prompt_for_help

**Args:**
- **prompt (str)**
- **docs (dict[str, str])**
- **examples (list[str])**
- **available_tutorials (list[str])**

**Returns:** str

### search_documentation

Search the documentation for the given query string.


**Args:**

- **query**: The query to search for.
- **n_results**: The number of results to return.


**Returns:**

A tuple of the ids and documents that match the query.
**Args:**
- **query (str)**
- **n_results (int) (default: 5)**

**Returns:** tuple[list[str], list[str]]

### search_examples

Search the examples for the given query string.


**Args:**

- **query**: The query to search for.
- **n_results**: The number of results to return.


**Returns:**

A tuple of the ids and documents that match the query.
**Args:**
- **query (str)**
- **n_results (int) (default: 3)**

### validate_schema

**Args:**
- **schema**

