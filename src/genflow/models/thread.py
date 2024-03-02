from datetime import datetime
from genflow.models.base_model import DBModel, DBField


class Thread(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_threads",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "user_id": "S", "assistant_id": "S"},
            "global_secondary_indexes": {
                "genflow_thread_user_index": {"user_id": "HASH"},
                "genflow_thread_user_assistant_index": {
                    "user_id": "HASH",
                    "assistant_id": "RANGE",
                },
            },
        }

    id: str = DBField(hash_key=True)
    assistant_id: str = DBField(default="")
    user_id: str = DBField(default="")
    created_at: datetime = DBField(default_factory=datetime.now)
    updated_at: datetime = DBField(default_factory=datetime.now)

    @classmethod
    def create(cls, id: str, assistant_id: str, user_id: str, **kwargs) -> "Thread":
        return super().create(
            id=id,
            assistant_id=assistant_id,
            user_id=user_id,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        user_id: str | None = None,
        assistant_id: str | None = None,
        limit: int = 10,
        start_key: str | None = None,
    ):
        if assistant_id:
            return cls.query(
                condition="user_id = :user_id AND assistant_id = :assistant_id",
                values={":user_id": user_id, ":assistant_id": assistant_id},
                index="genflow_thread_user_assistant_index",
                limit=limit,
                start_key=start_key,
            )
        elif user_id:
            return cls.query(
                condition="assistant_id = :assistant_id",
                values={":assistant_id": user_id},
                index="genflow_thread_user_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            raise ValueError("Must provide either user_id or assistant_id")
