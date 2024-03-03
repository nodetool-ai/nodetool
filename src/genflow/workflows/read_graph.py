from genflow.api.models.graph import Edge, Node
import uuid

from genflow.workflows.genflow_node import get_node_class, get_node_class_by_name


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

    # we loop through the nodes twice to make sure all nodes are created before we try to connect them
    for node_id, node in json.items():
        # supporting comfy workflow format
        if "class_type" in node:
            classes = get_node_class_by_name(node["class_type"])
            assert len(classes) > 0, f"Could not find node class {node['class_type']} for node {node_id}"
            # use name including namespace
            node_type = classes[0].get_node_type()
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
            if not isinstance(value, list)
        }

        node_instance = Node(id=node_id, type=node_type, data=data)

        nodes.append(node_instance)
        node_by_id[node_id] = node_instance

    # connect the nodes
    for node_id, node in json.items():
        # supporting comfy workflow format
        node_inputs = node.get("data", node.get("inputs", {}))

        # loop through the inputs and connect them
        for input_name, input_value in node_inputs.items():
            # a list value means that the input is connected to an output
            # the list contains the source node ID and the output handle
            if isinstance(input_value, list):
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
                    edge = Edge(
                        id=uuid.uuid4().hex,
                        source=source_id,
                        sourceHandle="",
                        target=node_id,
                        targetHandle=input_name,
                        source_index=source_handle,
                    )
                else:
                    edge = Edge(
                        id=uuid.uuid4().hex,
                        source=source_id,
                        sourceHandle=source_handle,
                        target=node_id,
                        targetHandle=input_name,
                    )

                edges.append(edge)

    return edges, nodes
