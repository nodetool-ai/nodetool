# nodetool.chat.help

## AddNodeTool

Tool for creating a new node.

## WorkflowTool

Tool for creating a new workflow.

### create_help_answer

**Args:**
- **messages (list[nodetool.metadata.types.Message])**

**Returns:** Message

### get_collection

Get or create a collection with the given name.


**Args:**

- **context**: The processing context.
- **name**: The name of the collection to get or create.
**Args:**
- **name**

### index_documentation

Index the documentation.
### index_examples

Index the examples.
### search_documentation

**Args:**
- **query (str)**
- **n_results (int) (default: 30)**

**Returns:** tuple[list[str], list[str]]

### search_examples

**Args:**
- **query (str)**
- **n_results (int) (default: 3)**

### system_prompt_for

**Args:**
- **docs (list[str])**
- **examples (list[str])**

**Returns:** str

### validate_schema

**Args:**
- **schema**

