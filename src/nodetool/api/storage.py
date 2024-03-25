#!/usr/bin/env python

from io import BytesIO
import os
from fastapi import APIRouter, Request, Response
from fastapi.responses import StreamingResponse
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


@router.get("/{bucket}/{key}")
async def get(bucket: str, key: str):
    """
    Returns the file as a stream for the given key.
    """
    storage = storage_for_bucket(bucket)
    if not storage.file_exists(key):
        return Response(status_code=404)

    iterator = storage.download_stream(key)
    ext = os.path.splitext(key)[-1]
    media_type = EXTENSION_TO_CONTENT_TYPE.get(ext, "application/octet-stream")
    return StreamingResponse(iterator, media_type=media_type)


@router.put("/{bucket}/{key}")
async def update(bucket: str, key: str, request: Request):
    """
    Updates or creates the file for the given key.
    """
    storage = storage_for_bucket(bucket)
    body = await request.body()
    storage.upload(key, BytesIO(body))

    # return the same xml response as aws s3 upload_fileobj
    return Response(status_code=200, content=b"")


@router.delete("/{bucket}/{key}")
async def delete(bucket: str, key: str):
    """
    Deletes the asset for the given key.
    """
    storage = storage_for_bucket(bucket)
    if not storage.file_exists(key):
        return Response(status_code=404)
    storage.delete(key)
