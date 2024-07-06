# nodetool.types.asset

## Asset

- **id** (`str`)
- **user_id** (`str`)
- **workflow_id** (`str | None`)
- **parent_id** (`str`)
- **name** (`str`)
- **status** (`str`)
- **content_type** (`str`)
- **created_at** (`str`)
- **get_url** (`str | None`)
- **thumb_url** (`str | None`)
- **duration** (`float | None`)

## AssetCreateRequest

- **workflow_id** (`str | None`)
- **parent_id** (`str | None`)
- **name** (`str`)
- **content_type** (`str`)
- **duration** (`float | None`)

## AssetDownloadRequest

- **asset_ids** (`list[str]`)

## AssetList

- **next** (`str | None`)
- **assets** (`list[nodetool.types.asset.Asset]`)

## AssetUpdateRequest

- **name** (`str | None`)
- **parent_id** (`str | None`)
- **status** (`str | None`)
- **content_type** (`str | None`)
- **duration** (`float | None`)

## TempAsset

- **get_url** (`str`)
- **put_url** (`str`)

