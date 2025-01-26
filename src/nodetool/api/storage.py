#!/usr/bin/env python

from datetime import timezone
from io import BytesIO
import os
import re
from typing import Optional
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


@router.head("/{key}")
async def head(key: str):
    """
    Returns the metadata for the file with the given key.
    """
    storage = Environment.get_asset_storage()
    if not storage.file_exists(key):
        raise HTTPException(status_code=404)

    last_modified = await storage.get_mtime(key)
    if not last_modified:
        raise HTTPException(status_code=404)

    return Response(
        status_code=200,
        headers={
            "Last-Modified": last_modified.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        },
    )


@router.get("/{key}")
async def get(key: str, request: Request):
    """
    Returns the file as a stream for the given key, supporting range queries.
    """
    storage = Environment.get_asset_storage()
    if not storage.file_exists(key):
        raise HTTPException(status_code=404)

    last_modified = await storage.get_mtime(key)
    if not last_modified:
        raise HTTPException(status_code=404)

    if "If-Modified-Since" in request.headers:
        if_modified_since = parsedate_to_datetime(request.headers["If-Modified-Since"])
        last_modified = last_modified.replace(tzinfo=timezone.utc)
        if if_modified_since >= last_modified:
            raise HTTPException(status_code=304)

    ext = os.path.splitext(key)[-1][1:]
    media_type = EXTENSION_TO_CONTENT_TYPE.get(ext, "application/octet-stream")
    headers = {
        "Last-Modified": last_modified.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "Accept-Ranges": "bytes",
        "Content-Type": media_type,
    }

    range_header = request.headers.get("Range")
    start: Optional[int] = 0
    end: Optional[int] = None

    if range_header:
        try:
            range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            if range_match:
                start = int(range_match.group(1))
                end_str = range_match.group(2)
                end = int(end_str)
            else:
                raise ValueError("Invalid range format")

            stream = BytesIO()
            await storage.download(key, stream)
            data = stream.getvalue()

            headers["Content-Range"] = f"bytes {start}-{end}/{len(data)}"
            headers["Content-Length"] = str(end - start + 1)

            return Response(
                content=data[start : end + 1],
                status_code=206,
                headers=headers,
            )
        except ValueError:
            # If range is invalid, ignore it and return full content
            pass

    # TODO: Add Content-Length header

    return StreamingResponse(
        content=storage.download_stream(key),
        headers=headers,
    )


@router.put("/{key}")
async def update(key: str, request: Request, user: User = Depends(current_user)):
    """
    Updates or creates the file for the given key.
    """
    storage = Environment.get_asset_storage()

    body = await request.body()
    await storage.upload(key, BytesIO(body))

    # return the same xml response as aws s3 upload_fileobj
    return Response(status_code=200, content=b"")


@router.delete("/{key}")
async def delete(key: str, user: User = Depends(current_user)):
    """
    Deletes the asset for the given key.
    """
    storage = Environment.get_asset_storage()
    if not storage.file_exists(key):
        return Response(status_code=404)
    await storage.delete(key)
