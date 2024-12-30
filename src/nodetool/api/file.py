#!/usr/bin/env python

import os
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment

log = Environment.get_logger()
router = APIRouter(prefix="/api/files", tags=["files"])


class FileInfo(BaseModel):
    name: str
    path: str
    size: int
    is_dir: bool
    modified_at: str


async def get_file_info(path: str) -> FileInfo:
    """Helper function to get file information"""
    try:
        stat = os.stat(path)
        return FileInfo(
            name=os.path.basename(path),
            path=path,
            size=stat.st_size,
            is_dir=os.path.isdir(path),
            modified_at=datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
        )
    except Exception as e:
        log.error(f"Error getting file info for {path}: {str(e)}")
        raise HTTPException(status_code=404, detail=f"File not found: {path}")


@router.get("/list")
async def list_files(
    path: str = ".", user: User = Depends(current_user)
) -> List[FileInfo]:
    """
    List files and directories in the specified path, excluding hidden files (starting with dot)
    """
    try:
        # Normalize and validate path
        expanded_path = os.path.expanduser(path)
        abs_path = os.path.abspath(expanded_path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail=f"Path not found: {path}")

        files = []
        for entry in os.listdir(abs_path):
            # Skip files/directories that start with a dot
            if entry.startswith("."):
                continue

            entry_path = os.path.join(abs_path, entry)
            try:
                file_info = await get_file_info(entry_path)
                files.append(file_info)
            except Exception as e:
                log.warning(f"Skipping {entry_path}: {str(e)}")
                continue

        return files
    except Exception as e:
        log.error(f"Error listing files in {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/info")
async def get_file(path: str, user: User = Depends(current_user)) -> FileInfo:
    """
    Get information about a specific file or directory
    """
    try:
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail=f"Path not found: {path}")
        return await get_file_info(abs_path)
    except Exception as e:
        log.error(f"Error getting file info for {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{path:path}")
async def download_file(path: str, user: User = Depends(current_user)):
    """
    Download a file from the specified path
    """
    try:
        abs_path = os.path.abspath(path)
        if not os.path.exists(abs_path) or os.path.isdir(abs_path):
            raise HTTPException(status_code=404, detail=f"File not found: {path}")

        async def file_iterator():
            chunk_size = 8192  # 8KB chunks
            with open(abs_path, "rb") as f:
                while chunk := f.read(chunk_size):
                    yield chunk

        return StreamingResponse(
            file_iterator(),
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{os.path.basename(path)}"'
            },
        )
    except Exception as e:
        log.error(f"Error downloading file {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload/{path:path}")
async def upload_file(path: str, file: UploadFile, user: User = Depends(current_user)):
    """
    Upload a file to the specified path
    """
    try:
        abs_path = os.path.abspath(path)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)

        # Read and write in chunks to handle large files
        with open(abs_path, "wb") as f:
            while chunk := await file.read(8192):
                f.write(chunk)

        return await get_file_info(abs_path)
    except Exception as e:
        log.error(f"Error uploading file to {path}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
