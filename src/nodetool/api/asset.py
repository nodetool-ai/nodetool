#!/usr/bin/env python

import asyncio
import datetime
from io import BytesIO
import re
from uuid import uuid4
import zipfile
from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from nodetool.types.asset import (
    Asset,
    AssetCreateRequest,
    AssetDownloadRequest,
    AssetList,
    AssetUpdateRequest,
    TempAsset,
)
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment
from typing import Dict, List, Optional, Tuple, Union
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
        page_size = 10000

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


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Asset:
    """
    Returns the asset for the given id.
    """
    if id == user.id:
        return Asset(
            user_id=user.id,
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
    asset = AssetModel.find(user.id, id)

    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if req.content_type:
        asset.content_type = req.content_type
    if req.metadata:
        asset.metadata = req.metadata
    if req.name:
        asset.name = req.name.strip()
    if req.parent_id:
        asset.parent_id = req.parent_id
    if req.data:
        storage = Environment.get_asset_storage()
        await storage.upload(asset.file_name, BytesIO(req.data.encode("utf-8")))

    asset.save()
    return Asset.from_model(asset)

@router.delete("/{id}")
async def delete(id: str, user: User = Depends(current_user)):
    """
    Deletes the asset for the given id. If the asset is a folder, it deletes all contents recursively.
    """
    try:
        asset = AssetModel.find(user.id, id)
        if asset is None:
            log.info(f"Asset not found: {id}")
            raise HTTPException(status_code=404, detail="Asset not found")
        deleted_asset_ids = []
        if asset.content_type == "folder":
            deleted_asset_ids = await delete_folder(user.id, id)
        else:
            await delete_single_asset(asset)
            deleted_asset_ids = [id]
        return {"deleted_asset_ids": deleted_asset_ids}
    except Exception as e:
        log.exception(f"Asset deletion failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting asset: {str(e)}")

async def delete_folder(user_id: str, folder_id: str) -> List[str]:
    deleted_asset_ids = []
    try:
        assets, next_cursor = AssetModel.paginate(
            user_id=user_id,
            parent_id=folder_id,
            limit=10000
        )
        # Delete children first
        for index, asset in enumerate(assets, 1):
            if asset.content_type == "folder":
                subfolder_deleted_ids = await delete_folder(user_id, asset.id)
                deleted_asset_ids.extend(subfolder_deleted_ids)
            else:
                await delete_single_asset(asset)
                deleted_asset_ids.append(asset.id)
        
        # Delete folder
        folder = AssetModel.find(user_id, folder_id)
        if folder:
            await delete_single_asset(folder)
            deleted_asset_ids.append(folder_id)
        else:
            log.warning(f"Folder not found when trying to delete: {folder_id}")
        log.info(f"Total assets deleted: {len(deleted_asset_ids)}")
        return deleted_asset_ids
    except Exception as e:
        log.exception(f"Error in delete_folder function for folder {folder_id}: {str(e)}")
        raise

async def delete_single_asset(asset: AssetModel):
    try:
        asset.delete()
        storage = Environment.get_asset_storage()
        try:
            await storage.delete(asset.thumb_file_name)
        except Exception as e:
            log.warning(f"Error deleting thumbnail for asset {asset.id}: {e}")
        try:
            await storage.delete(asset.file_name)
        except Exception as e:
            log.warning(f"Error deleting file for asset {asset.id}: {e}")
    except Exception as e:
        log.exception(f"Error in delete_single_asset function for asset {asset.id}: {str(e)}")
        raise

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
        if workflow and workflow.user_id != user.id:
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
            metadata=req.metadata,
            duration=duration,
        )
        if file_io:
            file_io.seek(0)
            await storage.upload(asset.file_name, file_io)

            if thumbnail:
                await storage.upload(asset.thumb_file_name, thumbnail)

    except Exception as e:
        log.exception(e)
        if asset:
            asset.delete()
        raise HTTPException(status_code=500, detail="Error uploading asset")

    return Asset.from_model(asset)


@router.post("/download")
async def download_assets(
    req: AssetDownloadRequest,
    current_user: User = Depends(current_user),
):
    """
    Create a ZIP file containing the requested assets and return it for download.
    Maintains folder structure based on asset.parent_id relationships.
    """
    if not req.asset_ids:
        raise HTTPException(status_code=400, detail="No asset IDs provided")

    zip_buffer = BytesIO()
    storage = Environment.get_asset_storage()

    # Dictionary to store asset paths
    asset_paths: Dict[str, str] = {}
    # Dictionary to store all assets
    all_assets: Dict[str, AssetModel] = {}

    def fetch_all_assets(asset_ids: List[str]):
        for asset_id in asset_ids:
            asset = AssetModel.get(asset_id)
            if asset:
                all_assets[asset.id] = asset
                if asset.parent_id and asset.parent_id not in all_assets:
                    fetch_all_assets([asset.parent_id])
                # Fetch all child assets if the asset is a folder
                if asset.content_type == "folder":
                    child_assets = AssetModel.get_children(asset.id)
                    child_asset_ids = [child.id for child in child_assets]
                    if child_asset_ids:
                        fetch_all_assets(child_asset_ids)

    fetch_all_assets(req.asset_ids)

    def get_asset_path(asset: AssetModel) -> str:
        if asset.id in asset_paths:
            return asset_paths[asset.id]

        if not asset.parent_id or asset.parent_id not in all_assets:
            path = asset.name
        else:
            parent_path = get_asset_path(all_assets[asset.parent_id])
            path = f"{parent_path}/{asset.name}"

        asset_paths[asset.id] = path
        return path

    async def fetch_asset_content(
        asset: AssetModel,
    ) -> Tuple[str, Union[BytesIO, None]]:
        try:
            if asset.user_id != current_user.id:
                raise HTTPException(
                    status_code=403,
                    detail=f"You don't have permission to download asset: {asset.id}",
                )

            asset_path = get_asset_path(asset)

            if asset.content_type == "folder":
                return f"{asset_path}/", None
            else:
                file_path = f"{asset_path}.{asset.file_extension}"
                file_content = BytesIO()
                await storage.download(asset.file_name, file_content)
                file_content.seek(0)
                return file_path, file_content
        except Exception as e:
            raise HTTPException(
                status_code=500, detail=f"Error downloading asset {asset.id}: {str(e)}"
            )

    # Fetch all asset contents in parallel
    asset_contents = await asyncio.gather(
        *[fetch_asset_content(asset) for asset in all_assets.values()]
    )

    # Write to zip file sequentially
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for file_path, content in asset_contents:
            if content is None:
                # This is a folder
                zip_file.writestr(file_path, "")
            else:
                zip_file.writestr(file_path, content.getvalue())

    zip_buffer.seek(0)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"assets_{timestamp}.zip"

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/{folder_id}/recursive")
async def get_assets_recursive(folder_id: str, user: User = Depends(current_user)):
    """
    Get all assets in a folder recursively, including the folder structure.
    """
    assets = AssetModel.get_assets_recursive(user.id, folder_id)
    return assets

