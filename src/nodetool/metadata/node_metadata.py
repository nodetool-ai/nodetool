from nodetool.workflows.property import Property
from nodetool.metadata.types import OutputSlot


from pydantic import BaseModel


class NodeMetadata(BaseModel):
    """
    Metadata for a node.
    """

    title: str
    description: str
    namespace: str
    node_type: str
    properties: list[Property]
    outputs: list[OutputSlot]
