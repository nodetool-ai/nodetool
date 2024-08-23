from typing import Any, List
from nodetool.types.graph import Graph
from nodetool.common.environment import Environment
from nodetool.models.asset import Asset as AssetModel
from nodetool.models.workflow import Workflow as WorkflowModel

from pydantic import BaseModel


def find_thumbnail(workflow: WorkflowModel) -> str | None:
    if workflow.thumbnail and workflow.thumbnail != "":
        asset = AssetModel.get(workflow.thumbnail)
    else:
        assets, _ = AssetModel.paginate(
            user_id=workflow.user_id, workflow_id=workflow.id, limit=1, reverse=True
        )
        asset = assets[0] if assets else None

    if asset:
        return Environment.get_asset_storage().get_url(asset.file_name)
    else:
        return None


class Workflow(BaseModel):
    id: str
    access: str
    created_at: str
    updated_at: str
    name: str
    description: str
    thumbnail: str | None = None
    thumbnail_url: str | None = None
    graph: Graph
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None

    @classmethod
    def from_model(cls, workflow: WorkflowModel):
        api_graph = workflow.get_api_graph()

        return cls(
            id=workflow.id,
            access=workflow.access,
            created_at=workflow.created_at.isoformat(),
            updated_at=workflow.updated_at.isoformat(),
            name=workflow.name,
            description=workflow.description or "",
            thumbnail=workflow.thumbnail or "",
            thumbnail_url=find_thumbnail(workflow),
            graph=api_graph,
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
