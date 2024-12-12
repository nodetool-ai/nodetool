# nodetool.common.huggingface_models

## CachedModel

**Fields:**
- **repo_id** (str)
- **repo_type** (str)
- **size_on_disk** (int)
- **the_model_type** (typing.Optional[str])
- **the_model_info** (nodetool.common.huggingface_models.ModelInfo | None)
- **readme** (str | None)


## ModelInfo

**Fields:**
- **id** (str)
- **modelId** (str)
- **author** (str)
- **sha** (str)
- **lastModified** (datetime)
- **private** (bool)
- **disabled** (bool)
- **gated** (bool | str)
- **pipeline_tag** (str | None)
- **tags** (typing.List[str])
- **downloads** (int)
- **library_name** (str | None)
- **likes** (int)
- **the_model_index** (typing.Optional[typing.Any])
- **config** (dict | None)
- **cardData** (dict | None)
- **siblings** (typing.Optional[typing.List[nodetool.common.huggingface_models.Sibling]])
- **spaces** (typing.Optional[typing.List[str]])
- **createdAt** (datetime)


## Sibling

**Fields:**
- **rfilename** (str)


### delete_cached_hf_model

Deletes a model from the Hugging Face cache and the in-memory cache.


**Args:**

- **model_id (str)**: The ID of the model to delete.
**Args:**
- **model_id (str)**

**Returns:** bool

### fetch_model_info

Fetches model info from the Hugging Face API or cache
using httpx
- **https**: //huggingface.co/api/models/{model_id}


**Args:**

- **model_id (str)**: The ID of the model to fetch.


**Returns:**

- **ModelInfo**: The model info.
**Args:**
- **model_id (str)**

**Returns:** nodetool.common.huggingface_models.ModelInfo | None

### fetch_model_readme

Fetches the readme from the Hugging Face API or cache
using httpx
- **https**: //huggingface.co/{model_id}/raw/main/README.md


**Args:**

- **model_id (str)**: The ID of the model to fetch.


**Returns:**

- **str**: The readme.
**Args:**
- **model_id (str)**

**Returns:** str | None

### model_type_from_model_info

**Args:**
- **recommended_models (dict[str, list[nodetool.metadata.types.HuggingFaceModel]])**
- **repo_id (str)**
- **model_info (nodetool.common.huggingface_models.ModelInfo | None)**

**Returns:** str | None

### read_cached_hf_models

Reads all models from the Hugging Face cache.


**Returns:**

- **List[CachedModel]**: A list of CachedModel objects found in the cache.
**Args:**
- **load_model_info (bool) (default: True)**

**Returns:** typing.List[nodetool.common.huggingface_models.CachedModel]

