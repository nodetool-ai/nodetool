from typing import Any
from nodetool.api.types.graph import Edge
from nodetool.workflows.base_node import BaseNode


def convert_to_comfy_workflow(edges: list[Edge], nodes: list[BaseNode]):
    """
    Converts a Nodetool workflow to a Comfy workflow.
    """
    json = {}
    for node in nodes:
        inputs = node.node_properties()
        inputs = {
            k: v.to_dict() if hasattr(v, "to_dict") else v
            for k, v in inputs.items()
            if v is not None
        }
        json[node._id] = {
            "class_type": node.__class__.__name__,
            "inputs": inputs,
        }

    def find_node(id):
        for node in nodes:
            if node._id == id:
                return node
        raise Exception(f"Could not find node with id {id}")

    def find_output(node: BaseNode, name: str):
        for index, output in enumerate(node.outputs()):
            if output.name == name:
                return index
        raise Exception(f"Could not find property {name} in node {node}")

    for edge in edges:
        source_node = find_node(edge.source)
        source_index = find_output(source_node, edge.sourceHandle)
        json[edge.target]["inputs"][edge.targetHandle] = [edge.source, source_index]

    return json
