from datetime import datetime
from typing import Any, Optional
from nodetool.common.content_types import CONTENT_TYPE_TO_EXTENSION
from nodetool.models.condition_builder import Field
from nodetool.types.graph import Graph as APIGraph
from nodetool.workflows.graph import Graph
from nodetool.workflows.base_node import BaseNode

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid


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

    def before_save(self):
        self.updated_at = datetime.now()

    @classmethod
    def from_dict(cls, data: dict[str, Any]):
        """
        Create a new Workflow object from a dictionary.
        """
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            access=data["access"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            name=data["name"],
            tags=data.get("tags", []),
            description=data.get("description", ""),
            thumbnail=data.get("thumbnail"),
            graph=data["graph"],
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
    ) -> tuple[list["Workflow"], str]:
        query = f"""
    SELECT w.*,
           a.id as asset_id,
           a.content_type as asset_content_type
    FROM {cls.get_table_schema()['table_name']} w
    LEFT OUTER JOIN (
        SELECT workflow_id, id, content_type,
               ROW_NUMBER() OVER (PARTITION BY workflow_id ORDER BY created_at DESC) as rn
        FROM nodetool_assets
    ) a ON (w.id = a.workflow_id AND a.rn = 1) OR (a.id = w.thumbnail)
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

        query += f"ORDER BY w.id ASC LIMIT {limit + 1}"

        results = cls.adapter().execute_sql(query, params)

        workflows = [
            Workflow.from_dict(
                {
                    **row,
                    "thumbnail": (
                        row["asset_id"]
                        + "."
                        + CONTENT_TYPE_TO_EXTENSION[row["asset_content_type"]]
                        if row["asset_id"] is not None
                        else None
                    ),
                }
            )
            for row in results[:limit]
        ]

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
