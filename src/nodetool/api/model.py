#!/usr/bin/env python

from nodetool.common.environment import Environment
from nodetool.api.utils import current_user
from nodetool.models.user import User
from fastapi import APIRouter, Depends, HTTPException, Response

log = Environment.get_logger()
router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/{folder}")
async def index(folder: str, user: User = Depends(current_user)) -> list[str]:
    try:
        return Environment.get_model_files(folder)
    except Exception as e:
        raise HTTPException(status_code=404, detail="Error getting model files")
