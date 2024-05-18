from typing import Optional, Literal
from datetime import datetime
from nodetool.common.content_types import CONTENT_TYPE_TO_EXTENSION
from nodetool.common.environment import Environment

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid

log = Environment.get_logger()


# Asset Pydantic Model
class Asset(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_assets",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {
                "id": "S",
                "user_id": "S",
                "parent_id": "S",
                "content_type": "S",
            },
            "global_secondary_indexes": {
                "nodetool_asset_user_content_type_index": {
                    "user_id": "HASH",
                    "content_type": "RANGE",
                },
                "nodetool_asset_parent_index": {
                    "user_id": "HASH",
                    "parent_id": "RANGE",
                },
            },
        }

    type: Literal["asset"] = "asset"
    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    workflow_id: str | None = DBField(default=None)
    parent_id: str = DBField(default="")
    file_id: str | None = DBField(default="")
    name: str = DBField(default="")
    status: str = DBField(default="pending")
    content_type: str = DBField(default="")
    created_at: datetime = DBField(default_factory=datetime.now)
    duration: Optional[float] = DBField(default=None)

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
    def has_thumbnail(self) -> bool:
        """
        Returns True if the asset type supports thumbnails.
        """
        return self.content_type.startswith("image/") or self.content_type.startswith(
            "video/"
        )

    @property
    def file_name(self) -> str:
        """
        Get the file name of the asset.
        """
        return f"{self.id}.{self.file_extension}"

    @property
    def thumb_file_name(self) -> str:
        """
        Get the file name of the thumbnail.
        """
        return f"{self.id}_thumb.jpg"

    @classmethod
    def create(
        cls,
        user_id: str,
        name: str,
        content_type: str,
        parent_id: str | None = None,
        workflow_id: str | None = None,
        status: str = "pending",
        duration: float | None = None,
        **kwargs,
    ):
        return super().create(
            id=create_time_ordered_uuid(),
            status=status,
            name=name,
            user_id=user_id,
            parent_id=parent_id or user_id,
            workflow_id=workflow_id,
            content_type=content_type,
            duration=duration,
            created_at=datetime.now(),
        )

    @classmethod
    def find(cls, user_id: str, asset_id: str):
        """
        Find an asset in DynamoDB by user_id and asset_id.
        """
        item = cls.get(asset_id)
        if item and item.user_id == user_id:
            return item
        return None

    @classmethod
    def paginate(
        cls,
        user_id: str,
        parent_id: Optional[str] = None,
        content_type: Optional[str] = None,
        limit: int = 100,
        start_key: str | None = None,
    ):
        """
        Paginate assets for a user using boto3.
        Applies filters for parent_id if provided.
        Returns a tuple of a list of Assets and the last evaluated key for pagination.
        """
        if parent_id:
            return cls.query(
                condition=("user_id = :user_id AND parent_id = :parent_id"),
                values={
                    ":user_id": user_id,
                    ":parent_id": parent_id,
                },
                index="nodetool_asset_parent_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            return cls.query(
                condition="user_id = :user_id AND begins_with(content_type, :content_type)",
                values={
                    ":user_id": user_id,
                    ":content_type": content_type or "",
                },
                index="nodetool_asset_user_content_type_index",
                limit=limit,
                start_key=start_key,
            )
