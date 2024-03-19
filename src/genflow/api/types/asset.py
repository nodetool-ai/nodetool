from pydantic import BaseModel

from genflow.common.content_types import CONTENT_TYPE_TO_EXTENSION
from genflow.common.environment import Environment
from genflow.models.asset import Asset as AssetModel


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
    put_url: str | None

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
        s3 = Environment.get_asset_storage()
        if asset.content_type != "folder":
            get_url = s3.generate_presigned_url("get_object", asset.file_name)
            put_url = s3.generate_presigned_url("put_object", asset.file_name)
        else:
            get_url = None
            put_url = None
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
            put_url=put_url,
        )


class AssetUpdateRequest(BaseModel):
    name: str | None
    parent_id: str | None
    status: str | None
    content_type: str | None


class AssetCreateRequest(BaseModel):
    workflow_id: str | None = None
    parent_id: str | None = None
    name: str
    content_type: str


class AssetList(BaseModel):
    next: str | None
    assets: list[Asset]
