from typing import Dict, List, Optional, Literal, Sequence
from datetime import datetime
from nodetool.common.content_types import CONTENT_TYPE_TO_EXTENSION
from nodetool.common.environment import Environment

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from nodetool.models.condition_builder import ConditionBuilder, Field

log = Environment.get_logger()


# Asset Pydantic Model
class Asset(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {"table_name": "nodetool_assets"}

    type: Literal["asset"] = "asset"
    id: str = DBField()
    user_id: str = DBField(default="")
    workflow_id: str | None = DBField(default=None)
    parent_id: str = DBField(default="")
    file_id: str | None = DBField(default="")
    name: str = DBField(default="")
    content_type: str = DBField(default="")
    metadata: dict | None = DBField(default=None)
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
        metadata: dict | None = None,
        parent_id: str | None = None,
        workflow_id: str | None = None,
        duration: float | None = None,
        **kwargs,
    ):
        return super().create(
            id=create_time_ordered_uuid(),
            name=name,
            user_id=user_id,
            parent_id=parent_id or user_id,
            workflow_id=workflow_id,
            content_type=content_type,
            duration=duration,
            created_at=datetime.now(),
            metadata=metadata,
            **kwargs,
        )

    @classmethod
    def find(cls, user_id: str, asset_id: str):
        """
        Find an asset by user_id and asset_id.
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
        workflow_id: Optional[str] = None,
        content_type: Optional[str] = None,
        limit: int = 100,
        start_key: str | None = None,
        reverse: bool = False,
    ):
        """
        Paginate assets for a user using boto3.
        Applies filters for parent_id if provided.
        Returns a tuple of a list of Assets and the last evaluated key for pagination.
        Last key is "" if there are no more items to be returned.
        """
        if parent_id:
            condition = (
                Field("user_id")
                .equals(user_id)
                .and_(Field("parent_id").equals(parent_id))
                .and_(Field("id").greater_than(start_key or ""))
            )
            return cls.query(condition, limit)
        elif workflow_id:
            condition = (
                Field("user_id")
                .equals(user_id)
                .and_(Field("workflow_id").equals(workflow_id))
                .and_(Field("id").greater_than(start_key or ""))
            )
            return cls.query(condition, limit)
        else:
            condition = (
                Field("user_id")
                .equals(user_id)
                .and_(Field("content_type").like((content_type or "") + "%"))
                .and_(Field("id").greater_than(start_key or ""))
            )
            return cls.query(condition, limit, reverse)

    @classmethod
    def get_children(cls, parent_id: str) -> Sequence["Asset"]:
        """
        Fetch all child assets for a given parent_id.
        """
        items, _ = cls.query(Field("parent_id").equals(parent_id))
        return items

    @classmethod
    def get_assets_recursive(cls, user_id: str, folder_id: str) -> Dict:
        """
        Fetch all assets recursively for a given folder_id.
        """
        def recursive_fetch(current_folder_id):
            assets, _ = cls.paginate(user_id=user_id, parent_id=current_folder_id, limit=10000)
            result = []
            for asset in assets:
                if asset.user_id != user_id:
                    continue
                
                asset_dict = asset.dict()
                if asset.content_type == "folder":
                    asset_dict["children"] = recursive_fetch(asset.id)
                result.append(asset_dict)
            
            return result

        folder = cls.find(user_id, folder_id)
        if not folder:
            log.warning(f"Folder {folder_id} not found for user {user_id}")
            return {"assets": []}

        folder_dict = folder.model_dump()
        folder_dict["children"] = recursive_fetch(folder_id)
        
        return {"assets": [folder_dict]}
