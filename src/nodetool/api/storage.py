#!/usr/bin/env python

from io import BytesIO
import os
from fastapi import APIRouter, Depends, Request, Response
from fastapi import HTTPException
from email.utils import parsedate_to_datetime
from fastapi.responses import StreamingResponse
from nodetool.api.utils import current_user
from nodetool.models.user import User
from nodetool.storage.abstract_storage import AbstractStorage
from nodetool.common.content_types import EXTENSION_TO_CONTENT_TYPE
from nodetool.common.environment import Environment

log = Environment.get_logger()
router = APIRouter(prefix="/api/storage", tags=["storage"])


def storage_for_bucket(bucket: str) -> AbstractStorage:
    if bucket == Environment.get_asset_bucket():
        return Environment.get_asset_storage()
    elif bucket == Environment.get_temp_bucket():
        return Environment.get_temp_storage()
    else:
        raise ValueError(f"Invalid bucket: {bucket}")


@router.head("/{bucket}/{key}")
async def head(bucket: str, key: str):
    """
    Returns the metadata for the file with the given key.
    """
    storage = storage_for_bucket(bucket)
    if not storage.file_exists(key):
        raise HTTPException(status_code=404)

    last_modified = await storage.get_mtime(key)
    return Response(
        status_code=200,
        headers={
            "Last-Modified": last_modified.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        },
    )


@router.get("/{bucket}/{key}")
async def get(bucket: str, key: str, request: Request):
    """
    Returns the file as a stream for the given key.
    """
    storage = storage_for_bucket(bucket)
    if not storage.file_exists(key):
        raise HTTPException(status_code=404)

    last_modified = await storage.get_mtime(key)
    if not last_modified:
        raise HTTPException(status_code=404)

    if "If-Modified-Since" in request.headers:
        if_modified_since = parsedate_to_datetime(request.headers["If-Modified-Since"])
        if if_modified_since >= last_modified:
            raise HTTPException(status_code=304)

    ext = os.path.splitext(key)[-1]
    media_type = EXTENSION_TO_CONTENT_TYPE.get(ext, "application/octet-stream")
    headers = {
        "Last-Modified": last_modified.strftime("%a, %d %b %Y %H:%M:%S GMT"),
    }

    return StreamingResponse(
        content=storage.download_stream(key), media_type=media_type, headers=headers
    )


@router.put("/{bucket}/{key}")
async def update(
    bucket: str, key: str, request: Request, user: User = Depends(current_user)
):
    """
    Updates or creates the file for the given key.
    """
    storage = storage_for_bucket(bucket)

    body = await request.body()
    await storage.upload(key, BytesIO(body))

    # return the same xml response as aws s3 upload_fileobj
    return Response(status_code=200, content=b"")


@router.delete("/{bucket}/{key}")
async def delete(bucket: str, key: str, user: User = Depends(current_user)):
    """
    Deletes the asset for the given key.
    """
    storage = storage_for_bucket(bucket)
    if not storage.file_exists(key):
        return Response(status_code=404)
    await storage.delete(key)
