from typing import Any
from nodetool.workflows.property import Property
from nodetool.metadata.types import OutputSlot, HuggingFaceModel


from pydantic import BaseModel


class NodeMetadata(BaseModel):
    """
    Metadata for a node.
    """

    title: str
    description: str
    namespace: str
    node_type: str
    layout: str
    properties: list[Property]
    outputs: list[OutputSlot]
    model_info: dict[str, Any]
    recommended_models: list[HuggingFaceModel]
