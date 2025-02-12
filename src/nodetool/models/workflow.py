from datetime import datetime
from typing import Any, Optional
from nodetool.common.content_types import CONTENT_TYPE_TO_EXTENSION
from nodetool.models.asset import Asset
from nodetool.models.condition_builder import Field
from nodetool.types.graph import Graph as APIGraph
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import BaseNode

from nodetool.models.base_model import (
    DBModel,
    DBField,
    DBIndex,
    create_time_ordered_uuid,
)


@DBIndex(columns=["user_id"])
class Workflow(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_workflows",
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    access: str = DBField(default="private")
    created_at: datetime = DBField(default_factory=datetime.now)
    updated_at: datetime = DBField(default_factory=datetime.now)
    name: str = DBField(default="")
    tags: list[str] | None = DBField(default_factory=list)
    description: str | None = DBField(default="")
    thumbnail: str | None = DBField(default=None)
    graph: dict = DBField(default_factory=dict)
    settings: dict[str, Any] | None = DBField(default_factory=dict)
    receive_clipboard: bool | None = DBField(default=False)

    def before_save(self):
        self.updated_at = datetime.now()

    @classmethod
    def from_dict(cls, data: dict[str, Any]):
        """
        Create a new Workflow object from a dictionary.
        """
        return cls(
            id=data.get("id", ""),
            user_id=data.get("user_id", ""),
            access=data.get("access", ""),
            created_at=data.get("created_at", datetime.now()),
            updated_at=data.get("updated_at", datetime.now()),
            name=data.get("name", ""),
            tags=data.get("tags", []),
            description=data.get("description", ""),
            thumbnail=data.get("thumbnail", None),
            settings=data.get("settings", {}),
            graph=data.get(
                "graph",
                {
                    "nodes": [],
                    "edges": [],
                },
            ),
        )

    @classmethod
    def find(cls, user_id: str, workflow_id: str):
        workflow = cls.get(workflow_id)
        return (
            workflow
            if workflow and (workflow.user_id == user_id or workflow.access == "public")
            else None
        )

    @classmethod
    def create(cls, user_id: str, name: str, graph: dict[str, Any], **kwargs):
        """
        Create a new image in the database.
        """

        return super().create(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            name=name,
            graph=graph,
            **kwargs,
        )

    @classmethod
    def paginate(
        cls,
        user_id: str | None = None,
        limit: int = 100,
        start_key: Optional[str] = None,
        columns: list[str] | None = None,
    ) -> tuple[list["Workflow"], str]:
        allowed_columns = {
            "id",
            "name",
            "description",
            "thumbnail",
            "access",
            "user_id",
            "created_at",
            "updated_at",
            "tags",
            "graph",
        }

        # Validate and sanitize column names
        if columns:
            invalid_columns = set(columns) - allowed_columns
            if invalid_columns:
                raise ValueError(f"Invalid columns requested: {invalid_columns}")
            sanitized_columns = [col for col in columns if col in allowed_columns]
            select_clause = ", ".join(f"w.{col}" for col in sanitized_columns)
        else:
            select_clause = "*"

        query = f"""
    SELECT {select_clause} FROM {cls.get_table_schema()['table_name']} w
    WHERE """
        params = {}

        if user_id is None:
            query += "w.access = :access AND "
            params["access"] = "public"
        else:
            query += "w.user_id = :user_id AND "
            params["user_id"] = user_id

        if start_key:
            query += "w.id > :start_key "
            params["start_key"] = start_key
        else:
            query += "1=1 "

        query += f"ORDER BY w.updated_at DESC LIMIT {limit + 1}"

        results = cls.adapter().execute_sql(query, params)

        workflows = [Workflow.from_dict(row) for row in results[:limit]]

        if len(results) > limit:
            last_evaluated_key = results[-1]["id"]
        else:
            last_evaluated_key = ""

        return workflows, last_evaluated_key

    def get_api_graph(self) -> APIGraph:
        """
        Returns the graph object for the workflow.
        """
        return APIGraph(
            nodes=self.graph["nodes"],
            edges=self.graph["edges"],
        )

    def get_graph(self) -> Graph:
        """
        Returns the graph object for the workflow.
        """
        return Graph(
            nodes=[
                BaseNode.from_dict(node, skip_errors=True)
                for node in self.graph["nodes"]
            ],
            edges=self.graph["edges"],
        )
