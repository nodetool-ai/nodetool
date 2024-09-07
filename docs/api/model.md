# nodetool.api.model

### augment_model_info

**Args:**
- **model (CachedModel)**
- **models (dict[str, nodetool.metadata.types.HuggingFaceModel])**

**Returns:** CachedModel

### delete_huggingface_model

**Args:**
- **repo_id (str)**

**Returns:** bool

### function_model

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.FunctionModel]

### get_huggingface_models

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.common.huggingface_models.CachedModel]

### get_recommended_models

### index

**Args:**
- **folder (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** list[str]

### llama_model

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.LlamaModel]

### recommended_models

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.HuggingFaceModel]

