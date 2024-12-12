# nodetool.api.model

## RepoPath

**Fields:**
- **repo_id** (str)
- **path** (str)
- **downloaded** (bool)


### delete_huggingface_model

**Args:**
- **repo_id (str)**

**Returns:** bool

### get_huggingface_file_info

**Args:**
- **requests (list[nodetool.common.huggingface_file.HFFileRequest])**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.common.huggingface_file.HFFileInfo]

### get_huggingface_models

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.common.huggingface_models.CachedModel]

### get_ollama_model_info_endpoint

**Args:**
- **model_name (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** dict | None

### get_ollama_models_endpoint

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.LlamaModel]

### get_system_stats_endpoint

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** SystemStats

### index

**Args:**
- **model_type (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.ModelFile]

### pull_ollama_model

**Args:**
- **model_name (str)**
- **user (User) (default: Depends(current_user))**

### recommended_models

**Args:**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.metadata.types.HuggingFaceModel]

### try_cache_files

**Args:**
- **paths (list[nodetool.api.model.RepoPath])**
- **user (User) (default: Depends(current_user))**

**Returns:** list[nodetool.api.model.RepoPath]

