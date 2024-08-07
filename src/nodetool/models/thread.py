from datetime import datetime
from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from nodetool.models.condition_builder import Field


class Thread(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {"table_name": "nodetool_threads"}

    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    created_at: datetime = DBField(default_factory=datetime.now)
    updated_at: datetime = DBField(default_factory=datetime.now)

    @classmethod
    def find(cls, user_id: str, id: str):
        thread = cls.get(id)
        if thread and thread.user_id == user_id:
            return thread
        return None

    @classmethod
    def create(cls, user_id: str, **kwargs) -> "Thread":
        return super().create(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        user_id: str,
        limit: int = 10,
        start_key: str | None = None,
        reverse: bool = False,
    ):
        return cls.query(
            condition=Field("user_id")
            .equals(user_id)
            .and_(Field("id").greater_than(start_key or "")),
            limit=limit,
            reverse=reverse,
        )
