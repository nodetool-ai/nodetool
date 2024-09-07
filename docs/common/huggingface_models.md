# nodetool.common.huggingface_models

## CachedModel

**Fields:**
- **repo_id** (str)
- **repo_type** (str)
- **size_on_disk** (int)
- **pipeline_tag** (typing.Optional[str])
- **model_type** (typing.Optional[str])


### delete_cached_model

Deletes a model from the Hugging Face cache.


**Args:**

- **model_id (str)**: The ID of the model to delete.
**Args:**
- **model_id (str)**

**Returns:** bool

### read_all_cached_models

Reads all models from the Hugging Face cache.


**Returns:**

- **List[CachedModel]**: A list of CachedModel objects found in the cache.
