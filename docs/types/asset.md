# nodetool.types.asset

## Asset

**Inherits from:** BaseModel

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

**Inherits from:** BaseModel

- **workflow_id** (`str | None`)
- **parent_id** (`str | None`)
- **name** (`str`)
- **content_type** (`str`)
- **duration** (`float | None`)

## AssetList

**Inherits from:** BaseModel

- **next** (`str | None`)
- **assets** (`list[nodetool.types.asset.Asset]`)

## AssetUpdateRequest

**Inherits from:** BaseModel

- **name** (`str | None`)
- **parent_id** (`str | None`)
- **status** (`str | None`)
- **content_type** (`str | None`)
- **duration** (`float | None`)

## TempAsset

**Inherits from:** BaseModel

- **get_url** (`str`)
- **put_url** (`str`)

