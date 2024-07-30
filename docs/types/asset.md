# nodetool.types.asset

## Asset

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

- **workflow_id** (str | None)
- **parent_id** (str | None)
- **name** (str)
- **content_type** (str)
- **metadata** (dict | None)
- **duration** (float | None)

## AssetDownloadRequest

- **asset_ids** (list)

## AssetList

- **next** (str | None)
- **assets** (list)

## AssetUpdateRequest

- **name** (str | None)
- **parent_id** (str | None)
- **content_type** (str | None)
- **data** (str | None)
- **metadata** (dict | None)
- **duration** (float | None)

## TempAsset

- **get_url** (str)
- **put_url** (str)

