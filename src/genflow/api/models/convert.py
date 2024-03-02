from genflow.api.models.graph import Node
from genflow.workflows.genflow_node import GenflowNode as NodeModel


def node_from_model(node: NodeModel):
    return Node(
        id=node.id,
        type=node.get_node_type(),
        ui_properties=node.ui_properties,
        data=node.node_properties(),
    )
