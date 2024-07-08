# nodetool.api.model

### function_model

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.FunctionModel]

### index

**Args:**
- **folder (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** list[str]

### llama_model

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.LlamaModel]

