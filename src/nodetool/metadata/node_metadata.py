from typing import Any
import json
import os
from functools import lru_cache
from nodetool.common.environment import Environment
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
    the_model_info: dict[str, Any]
    recommended_models: list[HuggingFaceModel]
    basic_fields: list[str]
    is_dynamic: bool


NODE_METADATA_PATH = (
    "nodes_production.json" if Environment.is_production() else "nodes.json"
)


@lru_cache(maxsize=1)
def load_node_metadata() -> list[NodeMetadata]:
    """
    Load node metadata from JSON file with caching.
    Returns the same instance on subsequent calls until cache is cleared.
    """
    current_dir = os.path.dirname(os.path.abspath(__file__))
    json_path = os.path.join(current_dir, NODE_METADATA_PATH)

    with open(json_path, "r") as f:
        return [NodeMetadata(**node) for node in json.load(f)]
