from pydantic import BaseModel

from nodetool.common.content_types import CONTENT_TYPE_TO_EXTENSION
from nodetool.common.environment import Environment
from nodetool.models.asset import Asset as AssetModel


class Asset(BaseModel):
    id: str
    user_id: str
    workflow_id: str | None
    parent_id: str
    name: str
    status: str
    content_type: str
    created_at: str
    get_url: str | None
    thumb_url: str | None
    duration: float | None = None

    @property
    def file_extension(self) -> str:
        """
        Get the file extension of the asset.

        For example, if the content type is "image/jpeg", this will return "jpeg".
        """
        return (
            CONTENT_TYPE_TO_EXTENSION[self.content_type]  # type: ignore
            if self.content_type in CONTENT_TYPE_TO_EXTENSION
            else "bin"
        )

    @property
    def file_name(self) -> str:
        """
        Get the file name of the asset.
        """
        return f"{self.id}.{self.file_extension}"

    @classmethod
    def from_model(cls, asset: AssetModel):
        storage = Environment.get_asset_storage()
        if asset.content_type != "folder":
            get_url = storage.generate_presigned_url("get_object", asset.file_name)
        else:
            get_url = None

        if asset.has_thumbnail:
            thumb_url = storage.generate_presigned_url(
                "get_object", asset.thumb_file_name
            )
        else:
            thumb_url = None

        return cls(
            id=asset.id,
            user_id=asset.user_id,
            workflow_id=asset.workflow_id,
            parent_id=asset.parent_id,
            name=asset.name,
            status=asset.status,
            content_type=asset.content_type,
            created_at=asset.created_at.isoformat(),
            get_url=get_url,
            thumb_url=thumb_url,
            duration=asset.duration,
        )


class AssetUpdateRequest(BaseModel):
    name: str | None
    parent_id: str | None
    status: str | None
    content_type: str | None
    duration: float | None = None


class AssetCreateRequest(BaseModel):
    workflow_id: str | None = None
    parent_id: str | None = None
    name: str
    content_type: str
    duration: float | None = None


class AssetList(BaseModel):
    next: str | None
    assets: list[Asset]


class TempAsset(BaseModel):
    get_url: str
    put_url: str
