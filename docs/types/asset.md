# nodetool.types.asset

## Asset

**Fields:**
- **id** (str)
- **user_id** (str)
- **workflow_id** (str | None)
- **parent_id** (str)
- **name** (str)
- **content_type** (str)
- **metadata** (dict[str, typing.Any] | None)
- **created_at** (str)
- **get_url** (str | None)
- **thumb_url** (str | None)
- **duration** (float | None)


## AssetCreateRequest

**Fields:**
- **workflow_id** (str | None)
- **parent_id** (str | None)
- **name** (str)
- **content_type** (str)
- **metadata** (dict | None)
- **duration** (float | None)


## AssetDownloadRequest

**Fields:**
- **asset_ids** (list[str])


## AssetList

**Fields:**
- **next** (str | None)
- **assets** (list[nodetool.types.asset.Asset])


## AssetUpdateRequest

**Fields:**
- **name** (str | None)
- **parent_id** (str | None)
- **content_type** (str | None)
- **data** (str | None)
- **metadata** (dict | None)
- **duration** (float | None)


## TempAsset

**Fields:**
- **get_url** (str)
- **put_url** (str)


