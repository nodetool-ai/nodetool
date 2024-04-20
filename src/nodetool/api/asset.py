#!/usr/bin/env python

from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from nodetool.api.types.asset import (
    Asset,
    AssetCreateRequest,
    AssetList,
    AssetUpdateRequest,
    TempAsset,
)
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment
from typing import Optional
from nodetool.models.asset import Asset as AssetModel
from nodetool.models.workflow import Workflow
#
import os
from nodetool.storage.file_storage import FileStorage
from nodetool.common.environment import Environment
from nodetool.common.media_utils import get_media_duration
from nodetool.common.media_utils import repackage_and_get_duration
import re

log = Environment.get_logger()
router = APIRouter(prefix="/api/assets", tags=["assets"])


@router.get("/")
async def index(
    parent_id: Optional[str] = None,
    content_type: Optional[str] = None,
    cursor: Optional[str] = None,
    page_size: Optional[int] = None,
    user: User = Depends(current_user),
    duration: Optional[int] = None,
) -> AssetList:
    """
    Returns all assets for a given user or workflow.
    """
    if page_size is None:
        page_size = 100

    if content_type is None and parent_id is None:
        parent_id = user.id

    assets, next_cursor = AssetModel.paginate(
        user_id=user.id,
        parent_id=parent_id,
        content_type=content_type,
        limit=page_size,
        start_key=cursor,
    )

    assets = [Asset.from_model(asset) for asset in assets]

    return AssetList(next=next_cursor, assets=assets)


@router.get("/temp")
async def create_temp(extension: str, user: User = Depends(current_user)) -> TempAsset:
    """
    Create a new temporary asset.
    """
    s3 = Environment.get_temp_storage()
    uuid = uuid4().hex
    return TempAsset(
        get_url=s3.generate_presigned_url("get_object", f"{uuid}.{extension}"),
        put_url=s3.generate_presigned_url("put_object", f"{uuid}.{extension}"),
    )


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Asset:
    """
    Returns the asset for the given id.
    """
    if id == user.id:
        return Asset(
            user_id=user.id,
            status="active",
            id=user.id,
            name="Home",
            content_type="folder",
            parent_id="",
            workflow_id=None,
            get_url=None,
            put_url=None,
            created_at=user.created_at.isoformat(),
        )
    asset = AssetModel.find(user.id, id)
    if asset is None:
        log.info("Asset not found: %s", id)
        raise HTTPException(status_code=404, detail="Asset not found")
    return Asset.from_model(asset)


from re import match

@router.put("/{id}")
async def update(
    id: str,
    req: AssetUpdateRequest,
    user: User = Depends(current_user),
) -> Asset:
    """
    Updates the asset for the given id.
    """
    print(f"Updating asset with ID: {id} for user: {user.id}")
  
    asset = AssetModel.find(user.id, id)
    storage = FileStorage(Environment.get_asset_folder(), Environment.get_nodetool_api_url() + "/storage")

    if asset.id and re.match(r'^(audio|video)/', asset.content_type):
        file_path = os.path.join(storage.base_path, asset.file_name)
        if os.path.exists(file_path):
            if asset.duration is None:
                try:
                    print("Attempting to get media duration...")
                    asset.duration = get_media_duration(file_path)
                    if asset.duration is None:
                        print("Asset duration was None, attempting to repackage...")
                        asset.duration = repackage_and_get_duration(file_path)
                    print(f"Setting asset duration: {asset.duration}")
                except Exception as e:
                    print(f"Error obtaining duration, trying repackaging: {e}")
                    asset.duration = repackage_and_get_duration(file_path)
                    print(f"Setting asset duration after repackaging: {asset.duration}")
            else:
                print(f"Duration already set to: {asset.duration}")
        else:
            print(f"File does not exist at {file_path}")

    if req.status:
        asset.status = req.status
    if req.content_type:
        asset.content_type = req.content_type
    if req.name:
        asset.name = req.name.strip()
    if req.parent_id:
        asset.parent_id = req.parent_id
    asset.save()
    return Asset.from_model(asset)


@router.delete("/{id}")
async def delete(id: str, user: User = Depends(current_user)):
    """
    Deletes the asset for the given id.
    """
    asset = AssetModel.find(user.id, id)
    if asset is None:
        log.info("Asset not found: %s", id)
        raise HTTPException(status_code=404, detail="Asset not found")
    asset.delete()
    Environment.get_asset_storage().delete(asset.file_name)
    log.info("Deleted asset: %s", id)


@router.post("/")
async def create(req: AssetCreateRequest, user: User = Depends(current_user)) -> Asset:
    """
    Create a new asset.
    """
    if req.workflow_id:
        workflow = Workflow.get(req.workflow_id)
        if workflow is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if workflow.user_id != user.id:
            raise HTTPException(status_code=404, detail="Workflow not found")

    asset = AssetModel.create(
        workflow_id=req.workflow_id,
        user_id=user.id,
        parent_id=req.parent_id,
        name=req.name,
        content_type=req.content_type,
    )
    return Asset.from_model(asset)
