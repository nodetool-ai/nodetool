from fastapi import APIRouter, Depends, HTTPException
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment
from nodetool.common.settings import (
    load_settings,
    save_settings,
    SettingsModel,
    SecretsModel,
)
from pydantic import BaseModel


router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    settings: SettingsModel
    secrets: SecretsModel


class SettingsUpdateRequest(BaseModel):
    settings: SettingsModel
    secrets: SecretsModel


@router.get("/")
async def get_settings(user: User = Depends(current_user)) -> SettingsResponse:
    if Environment.is_production():
        raise HTTPException(
            status_code=403, detail="Settings cannot be read in production"
        )

    settings, secrets = load_settings()

    return SettingsResponse(settings=settings, secrets=secrets)


@router.put("/")
async def update_settings(
    req: SettingsUpdateRequest, user: User = Depends(current_user)
) -> SettingsResponse:
    if Environment.is_production():
        raise HTTPException(
            status_code=403, detail="Settings cannot be updated in production"
        )

    settings, secrets = load_settings()

    for key, value in req.settings.model_dump().items():
        setattr(settings, key, value)

    for key, value in req.secrets.model_dump().items():
        setattr(secrets, key, value)

    save_settings(settings, secrets)

    Environment.load_settings()

    return SettingsResponse(settings=settings, secrets=secrets)
