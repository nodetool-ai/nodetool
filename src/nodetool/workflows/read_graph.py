from typing import Dict, List, Tuple, Any, Optional
from nodetool.common.comfy_node import resolve_comfy_class
from nodetool.types.graph import Edge, Node
from nodetool.workflows.base_node import get_node_class, get_comfy_class_by_name

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

# Constants
TYPE_KEY = "type"
CLASS_TYPE_KEY = "class_type"
DATA_KEY = "data"
INPUTS_KEY = "inputs"
POSITION_KEY = "position"
WIDTH_KEY = "width"
HEIGHT_KEY = "height"
PARENT_ID_KEY = "parent_id"


class GraphParsingError(Exception):
    """Custom exception for graph parsing errors."""

    pass


def generate_edge_id(edges: List[Edge]) -> str:
    """
    Finds the highest ID in the list of edges and returns a new ID that is one higher.
    """
    return str(max([int(edge.id or "0", 16) for edge in edges], default=0) + 1)


def create_node(node_id: str, node_data: Dict[str, Any]) -> Node:
    """
    Create a Node object from node data.

    Args:
        node_id (str): The ID of the node.
        node_data (Dict[str, Any]): The data for the node.

    Returns:
        Node: A new Node object.

    Raises:
        GraphParsingError: If the node type cannot be determined or found.
    """
    if CLASS_TYPE_KEY in node_data:
        node_type = get_comfy_class_by_name(node_data[CLASS_TYPE_KEY]).get_node_type()
    elif TYPE_KEY in node_data:
        node_class = get_node_class(node_data[TYPE_KEY])
        if not node_class:
            raise GraphParsingError(
                f"Could not find node class {node_data[TYPE_KEY]} for node {node_id}"
            )
        node_type = node_data[TYPE_KEY]
    else:
        raise GraphParsingError(f"Node {node_id} does not have a type")

    node_inputs = node_data.get(DATA_KEY, node_data.get(INPUTS_KEY, {}))
    data = {
        name: value
        for name, value in node_inputs.items()
        if not (isinstance(value, list) and len(value) == 2)
    }

    ui_properties = {
        key: node_data[key]
        for key in [POSITION_KEY, WIDTH_KEY, HEIGHT_KEY]
        if key in node_data
    }

    return Node(
        id=node_id,
        type=node_type,
        data=data,
        parent_id=node_data.get(PARENT_ID_KEY),
        ui_properties=ui_properties,
    )


def create_edges(
    edges: List[Edge],
    node_id: str,
    node_data: Dict[str, Any],
    node_by_id: Dict[str, Node],
):
    """
    Create Edge objects for a node's inputs.

    Args:
        edges (List[Edge]): The list of existing edges.
        node_id (str): The ID of the target node.
        node_data (Dict[str, Any]): The data for the node.
        node_by_id (Dict[str, Node]): A dictionary mapping node IDs to Node objects.

    Raises:
        GraphParsingError: If a referenced source node cannot be found.
    """
    node_inputs = node_data.get(DATA_KEY, node_data.get(INPUTS_KEY, {}))

    for input_name, input_value in node_inputs.items():
        if isinstance(input_value, list) and len(input_value) == 2:
            source_id, source_handle = input_value
            source_node = node_by_id.get(source_id)
            if source_node is None:
                raise GraphParsingError(
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
                id=generate_edge_id(edges),
                source=source_id,
                sourceHandle=source_handle,
                target=node_id,
                targetHandle=input_name,
            )
            edges.append(edge)


def is_comfy_widget(type: str | list) -> bool:
    """
    Check if the widget type is a Comfy widget.

    Args:
        type (str): The type of the widget.

    Returns:
        bool: True if the widget is a Comfy widget, False otherwise.
    """
    if isinstance(type, list):
        return True
    return type in ["INT", "FLOAT", "STRING", "BOOLEAN"]


def get_edge_names(class_name: str) -> List[str]:
    """
    Get the names of the input edgeds for a given node class.

    Args:
        class_name (str): The name of the node class.

    Returns:
        List[str]: A list of input names for the node class.
    """
    node_class = resolve_comfy_class(class_name)
    if node_class:
        inputs = list(
            getattr(node_class, "INPUT_TYPES")
            .__func__(node_class)
            .get("required", {})
            .items()
        )
        return [name for name, value in inputs if not is_comfy_widget(value[0])]
    return []


def get_widget_names(class_name: str) -> List[str]:
    """
    Get the names of the widgets for a given node class.

    Args:
        class_name (str): The name of the node class.

    Returns:
        List[str]: A list of widget names for the node class.
    """
    node_class = resolve_comfy_class(class_name)
    if node_class:
        inputs = list(
            getattr(node_class, "INPUT_TYPES")
            .__func__(node_class)
            .get("required", {})
            .items()
        )
        inputs = [name for name, value in inputs if is_comfy_widget(value[0])]

        # add seed_control_mode after seed for all samplers
        for i in range(len(inputs)):
            if inputs[i] in ["seed", "noise_seed"]:
                inputs.insert(i + 1, "seed_control_mode")
                break

        return inputs
    return []


def convert_graph(input_graph: dict[str, Any]) -> dict[str, Any]:
    """
    Convert a graph from the ComfyUI format to the ComfyUI API format.

    Args:
        input_graph (dict[str, Any]): The graph in ComfyUI format.

    Returns:
        dict[str, Any]: The graph in ComfyUI API format.
    """
    output_graph = {}

    # Process nodes
    for node in input_graph["nodes"]:
        node_id = str(node["id"])
        output_graph[node_id] = {"class_type": node["type"], "data": {}}

        # Add position information
        if "pos" in node:
            output_graph[node_id][POSITION_KEY] = {
                "x": node["pos"][0] / 2,
                "y": node["pos"][1] / 2,
            }

        # Add widget values if present
        if "widgets_values" in node:
            if node["type"] == "Note":
                output_graph[node_id]["data"]["comment"] = [
                    {"text": node["widgets_values"][0]}
                ]
                if "size" in node and isinstance(node["size"], dict):
                    output_graph[node_id][WIDTH_KEY] = node["size"]["0"]
                    output_graph[node_id][HEIGHT_KEY] = node["size"]["1"]
            else:
                names = get_widget_names(node["type"])
                for name, value in zip(names, node["widgets_values"]):
                    output_graph[node_id]["data"][name] = value

        # Process inputs
        if "inputs" in node:
            for input_data in node["inputs"]:
                if input_data["link"] is not None:
                    # Find the corresponding link
                    for link in input_graph["links"]:
                        if link[0] == input_data["link"]:
                            source_node_id = str(link[1])
                            source_node_output = link[2]
                            output_graph[node_id]["data"][input_data["name"]] = [
                                source_node_id,
                                source_node_output,
                            ]
                            break

    return output_graph


def read_graph(json: Dict[str, Any]) -> Tuple[List[Edge], List[Node]]:
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

    It also supports the comfy workflow format.
    In this case, we only search the comfy namespace for node classes
    to avoid conflicts with other node classes.

    The format of the ComfyUI representation has the following structure:
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
    - GraphParsingError: If there's an error in parsing the graph structure.

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
    if "last_node_id" in json:
        json = convert_graph(json)

    nodes: List[Node] = []
    edges: List[Edge] = []
    node_by_id: Dict[str, Node] = {}

    # First pass: create all nodes
    for node_id, node_data in json.items():
        try:
            node = create_node(node_id, node_data)
            nodes.append(node)
            node_by_id[node_id] = node
        except GraphParsingError as e:
            raise GraphParsingError(f"Error creating node {node_id}: {str(e)}")

    # Second pass: create all edges
    for node_id, node_data in json.items():
        try:
            create_edges(edges, node_id, node_data, node_by_id)
        except GraphParsingError as e:
            raise GraphParsingError(
                f"Error creating edges for node {node_id}: {str(e)}"
            )

    return edges, nodes


# Example usage
if __name__ == "__main__":
    graph_json = {
        "source_node_id": {
            "type": "InputNode",
        },
        "node_id": {
            "type": "ProcessNode",
            "data": {
                "property_name": "property_value",
                "input": ["source_node_id", "output"],
            },
        },
    }
    try:
        edges, nodes = read_graph(graph_json)
        print(f"Successfully parsed graph: {len(nodes)} nodes and {len(edges)} edges")
    except GraphParsingError as e:
        print(f"Error parsing graph: {str(e)}")
