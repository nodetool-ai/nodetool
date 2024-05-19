#!/usr/bin/env python

import asyncio
from io import BytesIO
import re
from uuid import uuid4
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
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

from nodetool.common.environment import Environment
from nodetool.common.media_utils import (
    create_image_thumbnail,
    create_video_thumbnail,
    get_audio_duration,
    get_video_duration,
)

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
            thumb_url=None,
            created_at=user.created_at.isoformat(),
        )
    asset = AssetModel.find(user.id, id)
    if asset is None:
        log.info("Asset not found: %s", id)
        raise HTTPException(status_code=404, detail="Asset not found")
    return Asset.from_model(asset)


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

    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
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
    try:
        Environment.get_asset_storage().delete(asset.thumb_file_name)
    except Exception as e:
        log.exception(e)
    try:
        Environment.get_asset_storage().delete(asset.file_name)
    except Exception as e:
        log.exception(e)

    log.info("Deleted asset: %s", id)


@router.post("/")
async def create(
    file: UploadFile | None = None,
    json: str | None = Form(None),
    user: User = Depends(current_user),
) -> Asset:
    """
    Create a new asset.
    """
    if json is None:
        raise HTTPException(status_code=400, detail="Missing JSON body")

    req = AssetCreateRequest.model_validate_json(json)
    asset = None
    duration = None
    file_io = None
    thumbnail = None

    if req.workflow_id:
        workflow = Workflow.get(req.workflow_id)
        if workflow is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        if workflow.user_id != user.id:
            raise HTTPException(status_code=404, detail="Workflow not found")

    try:
        if file:
            file_content = await file.read()
            file_io = BytesIO(file_content)
            storage = Environment.get_asset_storage()

            if "video" in req.content_type:
                duration = await get_video_duration(file_io)
                thumbnail = await create_video_thumbnail(file_io, 512, 512)
            elif "audio" in req.content_type:
                duration = get_audio_duration(file_io)
            elif "image" in req.content_type:
                thumbnail = await create_image_thumbnail(file_io, 512, 512)

        asset = AssetModel.create(
            workflow_id=req.workflow_id,
            user_id=user.id,
            parent_id=req.parent_id,
            name=req.name,
            content_type=req.content_type,
            duration=duration,
        )
        if file_io:
            file_io.seek(0)
            await storage.upload_async(asset.file_name, file_io)

            if thumbnail:
                await storage.upload_async(asset.thumb_file_name, thumbnail)

    except Exception as e:
        log.exception(e)
        if asset:
            asset.delete()
        raise HTTPException(status_code=500, detail="Error uploading asset")

    return Asset.from_model(asset)
