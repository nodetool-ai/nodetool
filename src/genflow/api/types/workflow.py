from typing import Any, List
from genflow.api.types.graph import Graph
from genflow.common.environment import Environment
from genflow.models.asset import Asset as AssetModel
from genflow.models.workflow import Workflow as WorkflowModel

from pydantic import BaseModel


class Workflow(BaseModel):
    id: str
    access: str
    created_at: str
    updated_at: str
    workflow_type: str | None = "workflow"
    name: str
    description: str
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    graph: Graph

    @classmethod
    def from_model(cls, workflow: WorkflowModel):
        thumbnail_url = None
        if workflow.thumbnail and workflow.thumbnail != "":
            asset = AssetModel.get(workflow.thumbnail)
            if asset:
                thumbnail_url = Environment.get_asset_storage().generate_presigned_url(
                    "get_object", asset.file_name
                )

        return cls(
            id=workflow.id,
            access=workflow.access,
            workflow_type=workflow.workflow_type,
            created_at=workflow.created_at.isoformat(),
            updated_at=workflow.updated_at.isoformat(),
            name=workflow.name,
            description=workflow.description or "",
            thumbnail=workflow.thumbnail or "",
            thumbnail_url=thumbnail_url,
            graph=Graph(
                nodes=workflow.graph["nodes"],
                edges=workflow.graph["edges"],
            ),
        )


class WorkflowRequest(BaseModel):
    name: str
    description: str
    thumbnail: str | None = None
    access: str
    graph: Graph | None = None
    comfy_workflow: dict[str, Any] | None = None


class WorkflowList(BaseModel):
    next: str | None
    workflows: List[Workflow]
