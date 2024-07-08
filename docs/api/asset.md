# nodetool.api.asset

### create

Create a new asset.
**Args:**
- **file (fastapi.datastructures.UploadFile | None) (default: None)**
- **json (str | None) (default: annotation=Union[str, NoneType] required=False default=None alias='json' json_schema_extra={})**
- **user (User) (default: Depends(current_user))**

**Returns:** Asset

### create_temp

Create a new temporary asset.
**Args:**
- **extension (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** TempAsset

### delete

Deletes the asset for the given id.
**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

### download_assets

Create a ZIP file containing the requested assets and return it for download.
Maintains folder structure based on asset.parent_id relationships.
**Args:**
- **req (AssetDownloadRequest)**
- **current_user (User) (default: Depends(current_user))**

### get

Returns the asset for the given id.
**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Asset

### index

Returns all assets for a given user or workflow.
**Args:**
- **parent_id (typing.Optional[str]) (default: None)**
- **content_type (typing.Optional[str]) (default: None)**
- **cursor (typing.Optional[str]) (default: None)**
- **page_size (typing.Optional[int]) (default: None)**
- **user (User) (default: Depends(current_user))**
- **duration (typing.Optional[int]) (default: None)**

**Returns:** AssetList

### update

Updates the asset for the given id.
**Args:**
- **id (str)**
- **req (AssetUpdateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Asset

