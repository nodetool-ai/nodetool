from genflow.common.openai_helpers import GPTModel

from genflow.models.base_model import DBModel, DBField


class Assistant(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_assistants",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "user_id": "S"},
            "global_secondary_indexes": {
                "genflow_assistant_user_index": {"user_id": "HASH"}
            },
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    name: str = DBField(default="")
    description: str = DBField(default="")
    instructions: str = DBField(default="")
    workflows: set[str] = DBField(default_factory=set)
    nodes: set[str] = DBField(default_factory=set)
    assets: set[str] = DBField(default_factory=set)
    model: str | None = DBField(default=GPTModel.GPT4)
    created_at: str = DBField(default="")
    updated_at: str = DBField(default="")

    @classmethod
    def paginate(
        cls,
        user_id: str = "",
        limit: int = 10,
        start_key: str | None = None,
    ):
        return cls.query(
            condition="user_id = :user_id",
            values={":user_id": user_id},
            index="genflow_assistant_user_index",
            limit=limit,
            start_key=start_key,
        )
