from nodetool.api.types.graph import Edge, Node
import uuid
from nodetool.workflows.base_node import get_node_class, get_node_class_by_name

"""
This module provides functionality to read and parse graph structures from JSON representations.

The main function in this module is `read_graph`, which takes a dictionary representation of a graph
and converts it into a tuple of Edge and Node lists. This function supports both a custom graph format
and the Comfy workflow format.

The module also includes utility functions for generating unique edge IDs and finding node classes.

Key Functions:
- read_graph: Converts a JSON representation of a graph into Edge and Node objects.
- generate_edge_id: Generates a unique ID for new edges.

The module relies on other parts of the nodetool package, particularly the types and base_node modules.

Example Usage:
    json_graph = {
        "node1": {"type": "InputNode", "data": {}},
        "node2": {"type": "ProcessNode", "data": {"input": ["node1", "output"]}}
    }
    edges, nodes = read_graph(json_graph)
"""


def read_graph(json: dict) -> tuple[list[Edge], list[Node]]:
    """
    This function reads a graph from a dictionary representation.

    The format of the dictionary representation has the following structure:
    {
        "source_node_id": {
            "type": "node_type",
        },
        "node_id": {
            "type": "node_type",
            "data": {
                "property_name": "property_value",
                "property_name": ["source_node_id", "source_node_output_handle"]
            }
        }
    }

    It also supports the comfy workflow format:
    {
        "source_node_id": {
            "class_type": "node_type",
        },
        "node_id": {
            "class_type": "node_type",
            "inputs": {
                "property_name": "property_value",
                "property_name": ["source_node_id", 0]
            }
        }
    }

    Parameters:
    - json (dict): The dictionary representation of the graph.

    Returns:
    - A tuple containing two lists: a list of edges and a list of nodes.

    Raises:
    - Exception: If the node type or class cannot be found.
    - Exception: If a source node referenced by a node cannot be found.

    Example usage:
    ```
    graph_json = {
        "source_node_id": {
            "type": "node_type",
        },
        "node_id": {
            "type": "node_type",
            "data": {
                "property_name": "property_value",
                "property_name": ["source_node_id", "source_node_output_handle"]
            }
        }
    }
    edges, nodes = read_graph(graph_json)
    ```
    """
    nodes: list[Node] = []
    edges: list[Edge] = []
    node_by_id: dict[str, Node] = {}

    def generate_edge_id():
        """
        Finds the highest ID in the list of edges and returns a new ID that is one higher.
        """
        return str(max([int(edge.id or "0", 16) for edge in edges], default=0) + 1)

    # we loop through the nodes twice to make sure all nodes are created before we try to connect them
    for node_id, node in json.items():
        # supporting comfy workflow format
        if "class_type" in node:
            classes = get_node_class_by_name(node["class_type"])
            assert (
                len(classes) > 0
            ), f"Could not find node class {node['class_type']} for node {node_id}"
            node_type = classes[0].get_node_type()
            if len(classes) > 1:
                for cls in classes:
                    if cls.get_node_type().startswith("comfy."):
                        node_type = cls.get_node_type()
                        break

        elif "type" in node:
            assert get_node_class(
                node["type"]
            ), f"Could not find node class {node['type']} for node {node_id}"
            node_type = node["type"]
        else:
            raise Exception(f"Node {node_id} does not have a type")

        node_inputs = node.get("data", node.get("inputs", {}))
        data = {
            name: value
            for name, value in node_inputs.items()
            if not (isinstance(value, list) and len(value) == 2)
        }

        parent_id = node.get("parent_id", None)
        ui_properties = {}

        if "position" in node:
            ui_properties["position"] = node["position"]

        if "width" in node:
            ui_properties["width"] = node["width"]

        if "height" in node:
            ui_properties["height"] = node["height"]

        node_instance = Node(
            id=node_id,
            type=node_type,
            data=data,
            parent_id=parent_id,
            ui_properties=ui_properties,
        )

        nodes.append(node_instance)
        node_by_id[node_id] = node_instance

    # connect the nodes
    for node_id, node in json.items():
        # supporting comfy workflow format
        node_inputs = node.get("data", node.get("inputs", {}))

        # loop through the inputs and connect them
        for input_name, input_value in node_inputs.items():
            # Check if the input value is a list and if it has exactly 2 elements
            if isinstance(input_value, list) and len(input_value) == 2:
                source_id, source_handle = input_value

                # look up the source node by ID, so we can find the output handle
                source_node = node_by_id.get(source_id)
                if source_node is None:
                    raise Exception(
                        f"Could not find source node {source_id} referenced by {node_id}"
                    )

                # supporting comfy workflow format, which uses index instead of handle
                # the index will be resolved in the workflow runner
                if isinstance(source_handle, int):
                    source_node_class = get_node_class(source_node.type)
                    assert source_node_class
                    source_handle = str(
                        source_node_class.find_output_by_index(source_handle).name
                    )

                edge = Edge(
                    id=generate_edge_id(),
                    source=source_id,
                    sourceHandle=source_handle,
                    target=node_id,
                    targetHandle=input_name,
                )

                edges.append(edge)

    return edges, nodes
