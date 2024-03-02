from datetime import datetime
from genflow.models.base_model import DBModel, DBField


class Message(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_messages",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "thread_id": "S"},
            "global_secondary_indexes": {
                "genflow_message_thread_index": {
                    "thread_id": "HASH",
                },
            },
        }

    id: str = DBField(hash_key=True)
    thread_id: str = DBField(default="")
    user_id: str = DBField(default="")
    role: str = DBField(default="")
    content: str | None = DBField(default=None)
    tool_calls: list[dict] | None = DBField(default=None)
    created_at: datetime = DBField(default_factory=datetime.now)

    @classmethod
    def create(cls, id: str, thread_id: str, user_id: str, **kwargs) -> "Message":
        return super().create(
            id=id,
            thread_id=thread_id,
            user_id=user_id,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        thread_id: str | None = None,
        limit: int = 10,
        start_key: str | None = None,
    ):
        return cls.query(
            condition="thread_id = :thread_id",
            values={":thread_id": thread_id},
            index="genflow_message_thread_index",
            limit=limit,
            start_key=start_key,
        )
